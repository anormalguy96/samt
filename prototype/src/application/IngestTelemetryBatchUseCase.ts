/**
 * Shared Application Use Case: Authenticated Telemetry Batch Ingestion
 * Used identically by the Node HTTP API, integration tests, and demo fault-injection paths.
 */

import type { Clock } from '../domain/ports/Clock.js';
import type { AuditEvent } from '../domain/ports/AuditPort.js';
import type {
  IngestionMode,
  MeterRegistry,
  ObservationQuality,
  TelemetryObservation,
  TelemetryObservationInput,
} from '../domain/ports/TelemetryPort.js';
import {
  TelemetryValidator,
  type ValidationOutcomeCode,
} from '../domain/telemetry/validation.js';
import { generateId } from './hashUtils.js';

export const MAX_TELEMETRY_BATCH_SIZE = 500;

export interface TelemetryBatchItemResult {
  observationId: string;
  meterId: string;
  accepted: boolean;
  code: ValidationOutcomeCode;
  quality: ObservationQuality;
  ingestionMode: IngestionMode;
  reason?: string;
}

export interface DurableTelemetryPersistenceResult {
  insertedObservationKeys: Set<string>;
  duplicateObservationKeys: Set<string>;
}

export interface ITelemetryBatchPersistence {
  persistObservations(
    observations: TelemetryObservation[],
    batchCorrelationId: string,
    auditEvent?: AuditEvent
  ): Promise<DurableTelemetryPersistenceResult>;
}

export interface IngestTelemetryBatchInput {
  authenticatedDeviceId: string;
  actorRole: 'device' | 'system';
  transmittedAt: Date;
  measurements: TelemetryObservationInput[];
  correlationId?: string;
  maxClockDriftMinutes?: number;
  maxHistoricalAgeHours?: number;
  allowHistoricalReplay?: boolean;
}

export interface IngestTelemetryBatchOutput {
  status: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'DUPLICATE_ONLY' | 'REJECTED';
  correlationId: string;
  receivedAt: Date;
  totalCount: number;
  acceptedCount: number;
  liveCount: number;
  historicalCount: number;
  duplicateCount: number;
  quarantinedCount: number;
  rejectedCount: number;
  triggeredLiveDispatch: boolean;
  results: TelemetryBatchItemResult[];
}

export class TelemetryBatchInputError extends Error {
  readonly code = 'INVALID_BATCH';
  constructor(message: string) {
    super(message);
    this.name = 'TelemetryBatchInputError';
  }
}

export class IngestTelemetryBatchUseCase {
  constructor(
    private clock: Clock,
    private registry: MeterRegistry,
    private persistence: ITelemetryBatchPersistence
  ) {}

  async execute(input: IngestTelemetryBatchInput): Promise<IngestTelemetryBatchOutput> {
    if (!Array.isArray(input.measurements) || input.measurements.length === 0) {
      throw new TelemetryBatchInputError('Telemetry batch must contain at least 1 measurement');
    }
    if (input.measurements.length > MAX_TELEMETRY_BATCH_SIZE) {
      throw new TelemetryBatchInputError(
        `Telemetry batch size ${input.measurements.length} exceeds maximum allowed limit (${MAX_TELEMETRY_BATCH_SIZE})`
      );
    }
    if (!(input.transmittedAt instanceof Date) || !Number.isFinite(input.transmittedAt.getTime())) {
      throw new TelemetryBatchInputError('Batch transmittedAt must be a valid Date');
    }

    const correlationId = input.correlationId ?? generateId('cor');
    const receivedAt = this.clock.now();
    const validator = new TelemetryValidator(this.clock, this.registry, {
      clientAuthenticated: true,
      authenticatedDeviceId: input.authenticatedDeviceId,
      maxClockDriftMinutes: input.maxClockDriftMinutes ?? 15,
      maxHistoricalAgeHours: input.maxHistoricalAgeHours ?? 72,
      allowHistoricalReplay: input.allowHistoricalReplay ?? true,
    });

    const toPersist: TelemetryObservation[] = [];
    const seenInBatch = new Set<string>();
    const results: TelemetryBatchItemResult[] = [];

    let quarantinedCount = 0;
    let rejectedCount = 0;
    let inBatchDuplicateCount = 0;

    for (const raw of input.measurements) {
      const obsInput: TelemetryObservationInput = {
        ...raw,
        deviceId: raw.deviceId || input.authenticatedDeviceId,
        transmittedAt: raw.transmittedAt ?? input.transmittedAt,
      };

      const key = `${obsInput.meterId}::${obsInput.observationId}`;
      const val = validator.validateStateless(obsInput);

      if (!val.accepted) {
        if (val.quality === 'QUARANTINED') {
          quarantinedCount++;
        } else {
          rejectedCount++;
        }
        results.push({
          observationId: obsInput.observationId ?? '',
          meterId: obsInput.meterId ?? '',
          accepted: false,
          code: val.code,
          quality: val.quality,
          ingestionMode: val.ingestionMode,
          reason: val.reason,
        });
        continue;
      }

      if (seenInBatch.has(key)) {
        inBatchDuplicateCount++;
        results.push({
          observationId: obsInput.observationId,
          meterId: obsInput.meterId,
          accepted: false,
          code: 'DUPLICATE',
          quality: 'REJECTED',
          ingestionMode: val.ingestionMode,
          reason: `Duplicate observation inside same batch: (${obsInput.meterId}, ${obsInput.observationId})`,
        });
        continue;
      }

      seenInBatch.add(key);
      if (val.normalizedObservation) {
        toPersist.push(val.normalizedObservation);
      }
      results.push({
        observationId: obsInput.observationId,
        meterId: obsInput.meterId,
        accepted: true,
        code: val.code,
        quality: val.quality,
        ingestionMode: val.ingestionMode,
        reason: val.reason,
      });
    }

    let persistedDuplicateCount = 0;
    if (toPersist.length > 0) {
      const auditEvent: AuditEvent = {
        id: generateId('aud'),
        timestamp: receivedAt,
        eventType: 'TELEMETRY_BATCH_INGESTED',
        sourceComponent: 'IngestTelemetryBatchUseCase',
        severity: quarantinedCount > 0 || rejectedCount > 0 ? 'WARN' : 'INFO',
        actorId: input.authenticatedDeviceId,
        actorRole: input.actorRole,
        correlationId,
        dmaId: toPersist[0].dmaId,
        message: `Batch processed from ${input.authenticatedDeviceId}: candidates=${toPersist.length}, quarantined=${quarantinedCount}, rejected=${rejectedCount}`,
        metadata: {
          batchSize: input.measurements.length,
          quarantinedCount,
          rejectedCount,
        },
      };

      const persisted = await this.persistence.persistObservations(
        toPersist,
        correlationId,
        auditEvent
      );

      // Mark rows already present in durable storage as DUPLICATE
      for (const r of results) {
        if (!r.accepted) continue;
        const key = `${r.meterId}::${r.observationId}`;
        if (persisted.duplicateObservationKeys.has(key)) {
          r.accepted = false;
          r.code = 'DUPLICATE';
          r.quality = 'REJECTED';
          r.reason = `Duplicate observation already persisted in durable storage: (${r.meterId}, ${r.observationId})`;
          persistedDuplicateCount++;
        }
      }
    }

    const acceptedResults = results.filter((r) => r.accepted);
    const acceptedCount = acceptedResults.length;
    const liveCount = acceptedResults.filter((r) => r.ingestionMode === 'LIVE').length;
    const historicalCount = acceptedResults.filter(
      (r) => r.ingestionMode === 'HISTORICAL_REPLAY'
    ).length;
    const duplicateCount = inBatchDuplicateCount + persistedDuplicateCount;

    let status: IngestTelemetryBatchOutput['status'] = 'ACCEPTED';
    if (acceptedCount === 0 && duplicateCount > 0 && rejectedCount === 0 && quarantinedCount === 0) {
      status = 'DUPLICATE_ONLY';
    } else if (acceptedCount === 0) {
      status = 'REJECTED';
    } else if (acceptedCount < input.measurements.length) {
      status = 'PARTIALLY_ACCEPTED';
    }

    // Historical replay never triggers fresh live dispatch; live ingestion itself persists only
    // and leaves incident creation to explicit operational assessment.
    const triggeredLiveDispatch = false;

    return {
      status,
      correlationId,
      receivedAt,
      totalCount: input.measurements.length,
      acceptedCount,
      liveCount,
      historicalCount,
      duplicateCount,
      quarantinedCount,
      rejectedCount,
      triggeredLiveDispatch,
      results,
    };
  }
}
