/**
 * Shared Application Use Case: DMA Balance & Nocturnal MNF Assessment
 * Loads per-meter persisted observations, integrates each meter independently via
 * shared flowIntegration.ts, computes water balance and MNF evaluation, and optionally
 * opens a reviewable DETECTED incident scoped strictly to that DMA.
 */

import type { Clock } from '../domain/ports/Clock.js';
import type { AuditEvent } from '../domain/ports/AuditPort.js';
import type {
  AuthorizedActor,
  CommandOutboxMessage,
  Incident,
} from '../domain/ports/IncidentPort.js';
import type {
  MeterDefinition,
  MeterRegistry,
  TelemetryObservation,
} from '../domain/ports/TelemetryPort.js';
import {
  integrateFlowVolume,
  type BoundaryPolicy,
  type FlowSample,
  type VolumeIntegrationResult,
} from '../domain/balance/flowIntegration.js';
import {
  calculateWaterBalance,
  type MeterBalanceContribution,
  type WaterBalanceResult,
} from '../domain/balance/waterBalance.js';
import {
  evaluateMinimumNightFlow,
  getNightWindowBoundsUtc,
  OPERATIONAL_BAKU_NIGHT_WINDOW,
  type MnfEvaluationResult,
  type NightWindowConfig,
} from '../domain/nightflow/nightWindowFilter.js';
import { generateId } from './hashUtils.js';

export interface DmaMetadata {
  dmaId: string;
  name: string;
  administrativeDistrict: string;
  baselineMnfM3h: number;
  baselinePressureBar: number;
  expectedSampleIntervalSec: number;
}

export interface ITelemetryQueryReader {
  getDma(dmaId: string): Promise<DmaMetadata | undefined>;
  getFlowObservationsForDma(
    dmaId: string,
    from: Date,
    to: Date,
    options?: { excludeHistoricalReplay?: boolean }
  ): Promise<TelemetryObservation[]>;
  getPressureObservationsForDma?(
    dmaId: string,
    from: Date,
    to: Date
  ): Promise<TelemetryObservation[]>;
}

export interface IIncidentCreationStore {
  getActiveIncidentsByDma(dmaId: string): Promise<Incident[]>;
  createIncidentAtomic(
    incident: Incident,
    auditEvent: AuditEvent,
    outboxMessage?: CommandOutboxMessage
  ): Promise<Incident>;
}

export interface DmaBalanceQueryInput {
  dmaId: string;
  windowStart: Date;
  windowEnd: Date;
  authorizedBilledConsumptionM3?: number;
  authorizedUnbilledConsumptionM3?: number;
  storageChangeM3?: number;
  boundaryPolicy?: BoundaryPolicy;
}

export interface DmaBalanceAssessmentOutput {
  dma: DmaMetadata;
  balance: WaterBalanceResult;
  perMeterIntegrations: {
    meter: MeterDefinition;
    integration: VolumeIntegrationResult;
  }[];
}

export interface DmaNightFlowQueryInput {
  dmaId: string;
  localDateYmd: string; // YYYY-MM-DD in Asia/Baku
  nightWindowConfig?: NightWindowConfig;
  excludeHistoricalReplay?: boolean;
}

export interface DmaNightFlowOutput {
  dma: DmaMetadata;
  localDateYmd: string;
  windowStart: Date;
  windowEnd: Date;
  avgPressureBar?: number;
  mnf: MnfEvaluationResult;
}

export interface DmaOperationalAssessmentOutput {
  nightFlow: DmaNightFlowOutput;
  incidentCreated: boolean;
  incident?: Incident;
  existingActiveIncident?: Incident;
  reason: string;
}

/**
 * Aggregates per-meter flow samples into a combined DMA inlet flow series by summing
 * active inlet meters at aligned timestamps (preserving multi-inlet totals).
 */
export function combineInletFlowSamples(
  observations: TelemetryObservation[],
  inletMeterIds: Set<string>
): FlowSample[] {
  const byTimestamp = new Map<number, Map<string, number[]>>();
  for (const obs of observations) {
    if (obs.metric !== 'FLOW_M3H' || !inletMeterIds.has(obs.meterId)) continue;
    if (obs.quality !== 'VALID' && obs.quality !== 'SUSPECT') continue;
    const ts = obs.observedAt.getTime();
    let meterMap = byTimestamp.get(ts);
    if (!meterMap) {
      meterMap = new Map();
      byTimestamp.set(ts, meterMap);
    }
    const vals = meterMap.get(obs.meterId) ?? [];
    vals.push(obs.value);
    meterMap.set(obs.meterId, vals);
  }

  const samples: FlowSample[] = [];
  for (const [ts, meterMap] of Array.from(byTimestamp.entries()).sort((a, b) => a[0] - b[0])) {
    let totalFlow = 0;
    for (const vals of meterMap.values()) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      totalFlow += mean;
    }
    samples.push({ timestamp: new Date(ts), flowM3h: totalFlow });
  }
  return samples;
}

export class AssessDmaHydraulicsUseCase {
  constructor(
    private clock: Clock,
    private registry: MeterRegistry,
    private telemetryReader: ITelemetryQueryReader,
    private incidentStore?: IIncidentCreationStore
  ) {}

  async computeBalance(input: DmaBalanceQueryInput): Promise<DmaBalanceAssessmentOutput | undefined> {
    const dma = await this.telemetryReader.getDma(input.dmaId);
    if (!dma) return undefined;

    const meters = this.registry
      .getMetersForDma(input.dmaId)
      .filter((m) => m.isActive !== false && m.role !== 'PRESSURE_MONITOR');

    // Fetch with a small buffer around window edges for boundary-bracketing interpolation
    const bufferMs = Math.max(dma.expectedSampleIntervalSec * 4, 300) * 1000;
    const rawObs = await this.telemetryReader.getFlowObservationsForDma(
      input.dmaId,
      new Date(input.windowStart.getTime() - bufferMs),
      new Date(input.windowEnd.getTime() + bufferMs)
    );

    const byMeter = new Map<string, FlowSample[]>();
    for (const m of meters) {
      byMeter.set(m.meterId, []);
    }
    for (const obs of rawObs) {
      if (obs.metric !== 'FLOW_M3H') continue;
      if (obs.quality !== 'VALID' && obs.quality !== 'SUSPECT') continue;
      const list = byMeter.get(obs.meterId);
      if (list) {
        list.push({ timestamp: obs.observedAt, flowM3h: obs.value });
      }
    }

    const perMeterIntegrations: { meter: MeterDefinition; integration: VolumeIntegrationResult }[] =
      [];
    const inlets: MeterBalanceContribution[] = [];
    const outlets: MeterBalanceContribution[] = [];
    const consumers: MeterBalanceContribution[] = [];

    for (const meter of meters) {
      const samples = byMeter.get(meter.meterId) ?? [];
      const integration = integrateFlowVolume(samples, {
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        expectedSampleIntervalSec: dma.expectedSampleIntervalSec,
        boundaryPolicy: input.boundaryPolicy ?? 'BOUNDED_HOLD',
      });
      perMeterIntegrations.push({ meter, integration });

      const contrib: MeterBalanceContribution = {
        meterId: meter.meterId,
        meterName: meter.name,
        role: meter.role as 'INLET' | 'OUTLET' | 'CONSUMER',
        volumeM3: integration.totalVolumeM3,
        measuredVolumeM3: integration.measuredVolumeM3,
        estimatedBoundaryVolumeM3: integration.estimatedBoundaryVolumeM3,
        averageFlowM3h: integration.averageFlowM3h,
        coverageRatio: integration.coverageRatio,
      };

      if (meter.role === 'INLET') inlets.push(contrib);
      else if (meter.role === 'OUTLET') outlets.push(contrib);
      else if (meter.role === 'CONSUMER') consumers.push(contrib);
    }

    const balance = calculateWaterBalance({
      dmaId: dma.dmaId,
      dmaName: dma.name,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      inletContributions: inlets,
      outletContributions: outlets,
      consumerContributions: consumers.length > 0 ? consumers : undefined,
      authorizedBilledConsumptionM3:
        consumers.length > 0 ? undefined : input.authorizedBilledConsumptionM3 ?? 0,
      authorizedUnbilledConsumptionM3: input.authorizedUnbilledConsumptionM3 ?? 0,
      storageChangeM3: input.storageChangeM3 ?? 0,
    });

    return {
      dma,
      balance,
      perMeterIntegrations,
    };
  }

  async evaluateNightFlow(input: DmaNightFlowQueryInput): Promise<DmaNightFlowOutput | undefined> {
    const dma = await this.telemetryReader.getDma(input.dmaId);
    if (!dma) return undefined;

    const config = input.nightWindowConfig ?? OPERATIONAL_BAKU_NIGHT_WINDOW;
    const { windowStart, windowEnd } = getNightWindowBoundsUtc(input.localDateYmd, config);

    const inletMeterIds = new Set(
      this.registry
        .getMetersForDma(input.dmaId)
        .filter((m) => m.isActive !== false && m.role === 'INLET')
        .map((m) => m.meterId)
    );

    const obs = await this.telemetryReader.getFlowObservationsForDma(
      input.dmaId,
      windowStart,
      windowEnd,
      { excludeHistoricalReplay: input.excludeHistoricalReplay }
    );

    const combinedSamples = combineInletFlowSamples(obs, inletMeterIds);
    const mnf = evaluateMinimumNightFlow(combinedSamples, dma.baselineMnfM3h, config);

    let avgPressureBar: number | undefined;
    if (this.telemetryReader.getPressureObservationsForDma) {
      const pObs = await this.telemetryReader.getPressureObservationsForDma(
        input.dmaId,
        windowStart,
        windowEnd
      );
      const validP = pObs.filter((o) => o.quality === 'VALID' || o.quality === 'SUSPECT');
      if (validP.length > 0) {
        avgPressureBar = parseFloat(
          (validP.reduce((acc, o) => acc + o.value, 0) / validP.length).toFixed(3)
        );
      }
    }

    return {
      dma,
      localDateYmd: input.localDateYmd,
      windowStart,
      windowEnd,
      avgPressureBar,
      mnf,
    };
  }

  /**
   * Evaluates persisted live nocturnal readings and opens a reviewable DETECTED incident
   * if an anomaly with sufficient coverage is detected and no active incident exists for this DMA.
   * Excludes HISTORICAL_REPLAY observations so historical backfills never trigger fresh live dispatch.
   */
  async assessAndOpenIncidentIfNeeded(
    input: DmaNightFlowQueryInput & {
      actor: AuthorizedActor;
      correlationId: string;
      pipeSegmentId?: string;
    }
  ): Promise<DmaOperationalAssessmentOutput | undefined> {
    if (!this.incidentStore) {
      throw new Error('incidentStore is required for assessAndOpenIncidentIfNeeded');
    }

    const nightFlow = await this.evaluateNightFlow({
      ...input,
      excludeHistoricalReplay: true,
    });
    if (!nightFlow) return undefined;

    if (!nightFlow.mnf.isAnomalyDetected) {
      return {
        nightFlow,
        incidentCreated: false,
        reason: nightFlow.mnf.detectionReason,
      };
    }

    const existingActive = await this.incidentStore.getActiveIncidentsByDma(input.dmaId);
    if (existingActive.length > 0) {
      return {
        nightFlow,
        incidentCreated: false,
        existingActiveIncident: existingActive[0],
        reason: `Active incident ${existingActive[0].incidentId} already exists for ${input.dmaId}; duplicate incident suppressed`,
      };
    }

    const now = this.clock.now();
    const incidentId = generateId('INC');
    const loss = nightFlow.mnf.excessNightFlowM3h;
    const severity = loss >= 35 ? 'CRITICAL' : loss >= 18 ? 'MEDIUM' : 'LOW';

    const incident: Incident = {
      incidentId,
      dmaId: input.dmaId,
      pipeSegmentId: input.pipeSegmentId,
      title: `${nightFlow.dma.name} — Nocturnal MNF Anomaly (+${loss.toFixed(1)} m³/h on ${input.localDateYmd})`,
      detectedAt: now,
      state: 'DETECTED',
      severity,
      estimatedLossM3h: parseFloat(loss.toFixed(2)),
      version: 1,
    };

    const auditEvent: AuditEvent = {
      id: generateId('aud'),
      timestamp: now,
      eventType: 'INCIDENT_DETECTED',
      sourceComponent: 'AssessDmaHydraulicsUseCase',
      severity: severity === 'CRITICAL' ? 'ERROR' : 'WARN',
      actorId: input.actor.actorId,
      actorRole: input.actor.role,
      correlationId: input.correlationId,
      dmaId: input.dmaId,
      incidentId,
      message: `Reviewable incident ${incidentId} created for ${input.dmaId}: ${nightFlow.mnf.detectionReason}`,
      metadata: {
        localDateYmd: input.localDateYmd,
        percentile5FlowM3h: nightFlow.mnf.percentile5FlowM3h,
        baselineMnfM3h: nightFlow.mnf.historicalBaselineMnfM3h,
        sampleCount: nightFlow.mnf.sampleCount,
        coverageRatio: nightFlow.mnf.coverageRatio,
      },
    };

    const outboxMessage: CommandOutboxMessage = {
      outboxId: generateId('out'),
      idempotencyKey: `incident-detected:${incidentId}`,
      incidentId,
      dmaId: input.dmaId,
      recipient: 'dispatch-desk@local.samt',
      severity: severity === 'CRITICAL' ? 'CRITICAL' : 'WARN',
      message: `Reviewable MNF anomaly detected in ${input.dmaId} (+${loss.toFixed(1)} m³/h)`,
      payload: {
        eventType: 'INCIDENT_DETECTED',
        incidentId,
        dmaId: input.dmaId,
        estimatedLossM3h: incident.estimatedLossM3h,
        localDateYmd: input.localDateYmd,
      },
    };

    const saved = await this.incidentStore.createIncidentAtomic(incident, auditEvent, outboxMessage);
    return {
      nightFlow,
      incidentCreated: true,
      incident: saved,
      reason: nightFlow.mnf.detectionReason,
    };
  }
}
