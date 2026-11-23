/**
 * SAMT v1.1.0 Modular Monolith HTTP API (Express + Zod + Shared TypeScript Domain Core)
 * All operational routes live under /v1; liveness/readiness live at /health and /ready.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { z } from 'zod';
import type { ServerConfig } from '../config.js';
import { checkDatabaseReady, type DbPool } from '../db/pool.js';
import { requireAuth } from '../auth/devAuth.js';
import { PostgresIncidentRepository } from '../repositories/PostgresIncidentRepository.js';
import {
  PostgresMeterRegistry,
  PostgresTelemetryRepository,
} from '../repositories/PostgresTelemetryRepository.js';
import { PostgresAuditAndAllocationRepository } from '../repositories/PostgresAuditAndAllocationRepository.js';
import type { OutboxDispatcher } from '../outbox/OutboxDispatcher.js';
import type { Clock } from '../../../prototype/src/domain/ports/Clock.js';
import { SystemClock } from '../../../prototype/src/domain/ports/Clock.js';
import type {
  Incident,
  IncidentEvent,
  VerificationWindowEvidence,
} from '../../../prototype/src/domain/ports/IncidentPort.js';
import {
  getLocalDateKey,
  OPERATIONAL_BAKU_NIGHT_WINDOW,
} from '../../../prototype/src/domain/nightflow/nightWindowFilter.js';
import {
  allocateConstrainedWater,
  AllocationValidationError,
} from '../../../prototype/src/domain/allocation/constrainedAllocation.js';
import {
  estimateIllustrativeSavings,
  SavingsValidationError,
} from '../../../prototype/src/domain/savings/illustrativeSavings.js';
import {
  IngestTelemetryBatchUseCase,
  MAX_TELEMETRY_BATCH_SIZE,
  TelemetryBatchInputError,
} from '../../../prototype/src/application/IngestTelemetryBatchUseCase.js';
import { AssessDmaHydraulicsUseCase } from '../../../prototype/src/application/AssessDmaHydraulicsUseCase.js';
import { ExecuteIncidentTransitionUseCase } from '../../../prototype/src/application/ExecuteIncidentTransitionUseCase.js';
import { generateId } from '../../../prototype/src/application/hashUtils.js';

export interface AppDependencies {
  config: ServerConfig;
  pool: DbPool;
  meterRegistry: PostgresMeterRegistry;
  telemetryRepo: PostgresTelemetryRepository;
  incidentRepo: PostgresIncidentRepository;
  auditRepo: PostgresAuditAndAllocationRepository;
  outboxDispatcher?: OutboxDispatcher;
  clock?: Clock;
  /** Optional hook for automated rollback tests */
  beforeTransitionCommitHook?: () => void | Promise<void>;
}

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const TelemetryBatchBodySchema = z.object({
  gateway_id: z.string().min(1).max(64).optional(),
  batch_timestamp: z.string().datetime({ offset: true }),
  is_historical_replay: z.boolean().optional(),
  measurements: z
    .array(
      z.object({
        observation_id: z.string().min(1).max(128),
        device_id: z.string().min(1).max(64).optional(),
        meter_id: z.string().min(1).max(32),
        dma_id: z.string().min(1).max(32),
        metric: z.enum(['FLOW_M3H', 'PRESSURE_BAR', 'LEVEL_METERS']),
        unit: z.enum(['m3/h', 'bar', 'm']).optional(),
        value: z.number(),
        observed_at: z.string().datetime({ offset: true }),
        transmitted_at: z.string().datetime({ offset: true }).optional(),
        battery_volts: z.number().optional(),
      })
    )
    .min(1)
    .max(MAX_TELEMETRY_BATCH_SIZE),
});

const VerificationWindowSchema = z.object({
  window_start: z.string().datetime({ offset: true }),
  window_end: z.string().datetime({ offset: true }),
  sample_count: z.number().int().min(0),
  coverage_ratio: z.number().min(0).max(1),
  mnf_m3h: z.number(),
  avg_pressure_bar: z.number().optional(),
  authorized_allowance_m3h: z.number().optional(),
  provenance: z.string().min(1),
});

const TransitionBodySchema = z.discriminatedUnion('event_type', [
  z.object({
    event_type: z.literal('ASSIGN'),
    expected_version: z.number().int().min(1),
    command_id: z.string().min(1).max(128).optional(),
    payload: z.object({
      crew_id: z.string().min(1),
      crew_name: z.string().min(1),
      crew_phone: z.string().min(1),
      role: z.string().min(1),
      eta_minutes: z.number(),
    }),
  }),
  z.object({
    event_type: z.literal('MARK_FALSE_ALARM'),
    expected_version: z.number().int().min(1),
    command_id: z.string().min(1).max(128).optional(),
    payload: z.object({
      reason: z.string().min(1),
    }),
  }),
  z.object({
    event_type: z.literal('START_REPAIR'),
    expected_version: z.number().int().min(1),
    command_id: z.string().min(1).max(128).optional(),
    payload: z.object({
      technician_id: z.string().min(1),
      check_in_gps: z.string().optional(),
    }),
  }),
  z.object({
    event_type: z.literal('RECORD_REPAIR_EVIDENCE'),
    expected_version: z.number().int().min(1),
    command_id: z.string().min(1).max(128).optional(),
    payload: z.object({
      technician_id: z.string().min(1),
      repair_method: z.string().min(1),
      clamp_type: z.string().optional(),
      acoustic_freq_hz: z.number().optional(),
      photo_fixture_ref: z.string().min(1),
      technician_notes: z.string().default(''),
    }),
  }),
  z.object({
    event_type: z.literal('EVALUATE_VERIFICATION'),
    expected_version: z.number().int().min(1),
    command_id: z.string().min(1).max(128).optional(),
    payload: z.object({
      pre_repair_date: z.string().regex(ISO_DATE_ONLY).optional(),
      post_repair_date: z.string().regex(ISO_DATE_ONLY).optional(),
      pre_repair_window: VerificationWindowSchema.optional(),
      post_repair_window: VerificationWindowSchema.optional(),
      baseline_mnf_m3h: z.number().optional(),
      leakage_exponent: z.number().optional(),
      // Accepted structurally only so we can explicitly ignore/test forged flags without schema crash
      is_successful: z.boolean().optional(),
      claimed_success: z.boolean().optional(),
    }),
  }),
  z.object({
    event_type: z.literal('CLOSE'),
    expected_version: z.number().int().min(1),
    command_id: z.string().min(1).max(128).optional(),
    payload: z
      .object({
        notes: z.string().optional(),
      })
      .default({}),
  }),
]);

const AllocationBodySchema = z.object({
  region_id: z.string().min(1),
  canal_network_id: z.string().min(1),
  available_water_m3: z.number(),
  volume_unit: z.enum(['THOUSAND_M3', 'M3']).optional().default('THOUSAND_M3'),
  delivery_horizon_hours: z.number().int().positive().optional().default(24),
  infeasible_minimums_policy: z.enum(['REJECT', 'PRORATE']).optional().default('REJECT'),
  consumers: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      region: z.string().optional().default(''),
      demand_m3: z.number(),
      priority_weight: z.number(),
      canal_capacity_m3: z.number(),
      minimum_survival_m3: z.number().optional(),
    })
  ),
});

const SavingsBodySchema = z.object({
  baseline_flow_m3h: z.number(),
  baseline_pressure_bar: z.number(),
  post_repair_flow_m3h: z.number(),
  post_repair_pressure_bar: z.number(),
  leakage_exponent: z.number().optional(),
  illustrative_tariff_azn_m3: z.number().optional(),
  time_horizon_days: z.number().optional(),
});

function serializeIncident(inc: Incident) {
  return {
    incident_id: inc.incidentId,
    dma_id: inc.dmaId,
    pipe_segment_id: inc.pipeSegmentId ?? null,
    title: inc.title,
    detected_at: inc.detectedAt.toISOString(),
    state: inc.state,
    severity: inc.severity,
    estimated_loss_m3h: inc.estimatedLossM3h,
    version: inc.version,
    crew_assignment: inc.crewAssignment
      ? {
          crew_id: inc.crewAssignment.crewId,
          crew_name: inc.crewAssignment.crewName,
          crew_phone: inc.crewAssignment.crewPhone,
          role: inc.crewAssignment.role,
          eta_minutes: inc.crewAssignment.etaMinutes,
          assigned_at: inc.crewAssignment.assignedAt.toISOString(),
          assigned_by: inc.crewAssignment.assignedBy ?? null,
        }
      : null,
    repair_evidence: inc.repairEvidence
      ? {
          technician_id: inc.repairEvidence.technicianId,
          repair_method: inc.repairEvidence.repairMethod,
          clamp_type: inc.repairEvidence.clampType ?? null,
          acoustic_freq_hz: inc.repairEvidence.acousticFreqHz ?? null,
          photo_fixture_ref: inc.repairEvidence.photoFixtureRef,
          completed_at: inc.repairEvidence.completedAt.toISOString(),
          technician_notes: inc.repairEvidence.technicianNotes,
          recorded_by: inc.repairEvidence.recordedBy ?? null,
        }
      : null,
    verification_result: inc.verificationResult
      ? {
          evaluated_at: inc.verificationResult.evaluatedAt.toISOString(),
          evaluated_by: inc.verificationResult.evaluatedBy ?? null,
          outcome: inc.verificationResult.outcome,
          pre_repair_mnf_m3h: inc.verificationResult.preRepairMnfM3h,
          post_repair_mnf_m3h: inc.verificationResult.postRepairMnfM3h,
          pressure_normalized_pre_mnf_m3h: inc.verificationResult.pressureNormalizedPreMnfM3h,
          baseline_mnf_m3h: inc.verificationResult.baselineMnfM3h,
          verified_loss_drop_m3h: inc.verificationResult.verifiedLossDropM3h,
          is_successful: inc.verificationResult.isSuccessful,
          policy_label: inc.verificationResult.policyLabel,
          assumptions: inc.verificationResult.assumptions,
          reason: inc.verificationResult.reason,
        }
      : null,
    closed_at: inc.closedAt ? inc.closedAt.toISOString() : null,
    closed_by: inc.closedBy ?? null,
    false_alarm_reason: inc.falseAlarmReason ?? null,
  };
}

function isDatabaseUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; name?: string };
  const pgDownCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '57P01', '57P02', '57P03', '08000', '08001', '08003', '08006']);
  if (e.code && pgDownCodes.has(e.code)) return true;
  if (e.message && /ECONNREFUSED|Connection terminated|Cannot use a pool after calling end|timeout expired/i.test(e.message)) {
    return true;
  }
  return false;
}

function mapApiWindowToDomain(w: z.infer<typeof VerificationWindowSchema>): VerificationWindowEvidence {
  return {
    windowStart: new Date(w.window_start),
    windowEnd: new Date(w.window_end),
    sampleCount: w.sample_count,
    coverageRatio: w.coverage_ratio,
    mnfM3h: w.mnf_m3h,
    avgPressureBar: w.avg_pressure_bar,
    authorizedAllowanceM3h: w.authorized_allowance_m3h,
    provenance: w.provenance,
  };
}

export function createApp(deps: AppDependencies) {
  const clock: Clock = deps.clock ?? new SystemClock();
  const app = express();

  app.use(
    cors({
      origin: deps.config.corsOrigin === '*' ? true : [deps.config.corsOrigin, 'http://127.0.0.1:3000', 'http://localhost:5173'],
      exposedHeaders: ['X-Correlation-Id'],
    })
  );
  app.use(express.json({ limit: '1mb' }));

  // Correlation ID middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header('X-Correlation-Id')?.trim();
    req.correlationId = incoming && incoming.length <= 64 ? incoming : generateId('cor');
    res.setHeader('X-Correlation-Id', req.correlationId);
    next();
  });

  // Malformed JSON error handler
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        error_code: 'INVALID_JSON',
        message: 'Malformed JSON request body',
        correlation_id: req.correlationId,
        timestamp: clock.now().toISOString(),
      });
      return;
    }
    next(err);
  });

  const ingestUseCase = new IngestTelemetryBatchUseCase(
    clock,
    deps.meterRegistry,
    deps.telemetryRepo
  );
  const assessUseCase = new AssessDmaHydraulicsUseCase(
    clock,
    deps.meterRegistry,
    deps.telemetryRepo,
    deps.incidentRepo
  );
  const transitionUseCase = new ExecuteIncidentTransitionUseCase(deps.incidentRepo, clock);

  // Health & Readiness
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'OK',
      service: 'samt-api',
      version: '1.1.0',
      timestamp: clock.now().toISOString(),
    });
  });

  app.get('/ready', async (req, res) => {
    const db = await checkDatabaseReady(deps.pool);
    if (!db.ok) {
      res.status(503).json({
        status: 'DEGRADED',
        database: 'DOWN',
        error_code: 'DATABASE_UNAVAILABLE',
        message: db.error ?? 'PostgreSQL is unreachable',
        correlation_id: req.correlationId,
        timestamp: clock.now().toISOString(),
      });
      return;
    }
    res.status(200).json({
      status: 'READY',
      database: 'UP',
      db_latency_ms: db.latencyMs,
      version: '1.1.0',
      correlation_id: req.correlationId,
      timestamp: clock.now().toISOString(),
    });
  });

  // v1 Router
  const v1 = express.Router();

  // GET /v1/dmas
  v1.get('/dmas', requireAuth(deps.config, ['viewer', 'dispatcher']), async (_req, res, next) => {
    try {
      const dmas = await deps.telemetryRepo.listDmas();
      res.status(200).json({
        dmas: dmas.map((d) => ({
          dma_id: d.dmaId,
          name: d.name,
          administrative_district: d.administrativeDistrict,
          baseline_mnf_m3h: d.baselineMnfM3h,
          baseline_pressure_bar: d.baselinePressureBar,
          expected_sample_interval_sec: d.expectedSampleIntervalSec,
          meters: deps.meterRegistry.getMetersForDma(d.dmaId).map((m) => ({
            meter_id: m.meterId,
            role: m.role,
            name: m.name,
            bound_device_id: m.boundDeviceId ?? null,
            is_active: m.isActive !== false,
            allowed_metrics: m.allowedMetrics ?? [],
            canonical_unit: m.canonicalUnit ?? 'm3/h',
          })),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /v1/telemetry/batch (device-only restricted ingestion)
  v1.post('/telemetry/batch', requireAuth(deps.config, ['device']), async (req, res, next) => {
    try {
      const parsed = TelemetryBatchBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error_code: 'INVALID_BATCH_PAYLOAD',
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          correlation_id: req.correlationId,
          timestamp: clock.now().toISOString(),
        });
        return;
      }

      const body = parsed.data;
      const authDeviceId = req.principal!.deviceId!;

      // Reject spoofed gateway_id mismatch at batch envelope level too
      if (body.gateway_id && body.gateway_id !== authDeviceId) {
        res.status(403).json({
          error_code: 'DEVICE_IDENTITY_MISMATCH',
          message: `Authenticated device '${authDeviceId}' cannot submit batches claiming gateway_id '${body.gateway_id}'`,
          correlation_id: req.correlationId,
          timestamp: clock.now().toISOString(),
        });
        return;
      }

      const result = await ingestUseCase.execute({
        authenticatedDeviceId: authDeviceId,
        actorRole: 'device',
        transmittedAt: new Date(body.batch_timestamp),
        correlationId: req.correlationId,
        measurements: body.measurements.map((m) => ({
          observationId: m.observation_id,
          deviceId: m.device_id ?? authDeviceId,
          meterId: m.meter_id,
          dmaId: m.dma_id,
          metric: m.metric,
          unit: m.unit,
          value: m.value,
          observedAt: new Date(m.observed_at),
          transmittedAt: m.transmitted_at ? new Date(m.transmitted_at) : new Date(body.batch_timestamp),
          callerHistoricalHint: body.is_historical_replay,
          batteryVolts: m.battery_volts,
        })),
      });

      const httpStatus = result.status === 'REJECTED' ? 422 : 200;
      res.status(httpStatus).json({
        status: result.status,
        correlation_id: result.correlationId,
        received_at: result.receivedAt.toISOString(),
        total_count: result.totalCount,
        accepted_count: result.acceptedCount,
        live_count: result.liveCount,
        historical_count: result.historicalCount,
        duplicate_count: result.duplicateCount,
        quarantined_count: result.quarantinedCount,
        rejected_count: result.rejectedCount,
        triggered_live_dispatch: result.triggeredLiveDispatch,
        results: result.results.map((r) => ({
          observation_id: r.observationId,
          meter_id: r.meterId,
          accepted: r.accepted,
          code: r.code,
          quality: r.quality,
          ingestion_mode: r.ingestionMode,
          reason: r.reason ?? null,
        })),
      });
    } catch (err) {
      if (err instanceof TelemetryBatchInputError) {
        res.status(400).json({
          error_code: err.code,
          message: err.message,
          correlation_id: req.correlationId,
          timestamp: clock.now().toISOString(),
        });
        return;
      }
      next(err);
    }
  });

  // GET /v1/dma/:dmaId/balance
  v1.get('/dma/:dmaId/balance', requireAuth(deps.config, ['viewer', 'dispatcher']), async (req, res, next) => {
    try {
      const dmaId = String(req.params.dmaId);
      const now = clock.now();
      const windowEnd = req.query.window_end
        ? new Date(String(req.query.window_end))
        : now;
      const windowStart = req.query.window_start
        ? new Date(String(req.query.window_start))
        : new Date(windowEnd.getTime() - 15 * 60 * 1000);

      if (!Number.isFinite(windowStart.getTime()) || !Number.isFinite(windowEnd.getTime()) || windowEnd <= windowStart) {
        res.status(400).json({
          error_code: 'INVALID_WINDOW',
          message: 'window_start and window_end must be valid ISO-8601 timestamps with window_end > window_start',
          correlation_id: req.correlationId,
          timestamp: now.toISOString(),
        });
        return;
      }

      const authBilled = req.query.authorized_billed_m3 !== undefined ? Number(req.query.authorized_billed_m3) : 0;
      const authUnbilled = req.query.authorized_unbilled_m3 !== undefined ? Number(req.query.authorized_unbilled_m3) : 0;
      const storageChange = req.query.storage_change_m3 !== undefined ? Number(req.query.storage_change_m3) : 0;
      const boundaryPolicy =
        req.query.boundary_policy === 'STRICT_INTERIOR' ? 'STRICT_INTERIOR' : 'BOUNDED_HOLD';

      if (!Number.isFinite(authBilled) || authBilled < 0 || !Number.isFinite(authUnbilled) || authUnbilled < 0 || !Number.isFinite(storageChange)) {
        res.status(400).json({
          error_code: 'INVALID_BALANCE_PARAMETERS',
          message: 'authorized_billed_m3 and authorized_unbilled_m3 must be >= 0; storage_change_m3 must be finite',
          correlation_id: req.correlationId,
          timestamp: now.toISOString(),
        });
        return;
      }

      const output = await assessUseCase.computeBalance({
        dmaId,
        windowStart,
        windowEnd,
        authorizedBilledConsumptionM3: authBilled,
        authorizedUnbilledConsumptionM3: authUnbilled,
        storageChangeM3: storageChange,
        boundaryPolicy,
      });

      if (!output) {
        res.status(404).json({
          error_code: 'DMA_NOT_FOUND',
          message: `DMA '${dmaId}' not found`,
          correlation_id: req.correlationId,
          timestamp: now.toISOString(),
        });
        return;
      }

      const b = output.balance;
      res.status(200).json({
        dma_id: b.dmaId,
        dma_name: output.dma.name,
        window_start: b.windowStart.toISOString(),
        window_end: b.windowEnd.toISOString(),
        total_inflow_m3: b.totalInflowM3,
        total_outflow_m3: b.totalOutflowM3,
        measured_inflow_m3: b.measuredInflowM3,
        measured_outflow_m3: b.measuredOutflowM3,
        net_boundary_flow_m3: b.netBoundaryFlowM3,
        authorized_consumption_m3: b.authorizedConsumptionM3,
        storage_change_m3: b.storageChangeM3,
        signed_residual_m3: b.signedResidualM3,
        unexplained_residual_fraction: b.unexplainedResidualFraction,
        coverage_ratio: b.overallCoverageRatio,
        uncertainty_m3: b.uncertaintyM3,
        status: b.status,
        evidence_qualification: b.evidenceQualification,
        assumptions: b.assumptions,
        per_meter_integrations: output.perMeterIntegrations.map((pm) => ({
          meter_id: pm.meter.meterId,
          role: pm.meter.role,
          status: pm.integration.status,
          total_volume_m3: pm.integration.totalVolumeM3,
          measured_volume_m3: pm.integration.measuredVolumeM3,
          estimated_boundary_volume_m3: pm.integration.estimatedBoundaryVolumeM3,
          sample_count: pm.integration.inWindowSampleCount,
          coverage_ratio: pm.integration.coverageRatio,
          max_gap_seconds: pm.integration.maxGapSeconds,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/dma/:dmaId/night-flow
  v1.get('/dma/:dmaId/night-flow', requireAuth(deps.config, ['viewer', 'dispatcher']), async (req, res, next) => {
    try {
      const dmaId = String(req.params.dmaId);
      const dateStr = req.query.date ? String(req.query.date) : getLocalDateKey(clock.now());
      if (!ISO_DATE_ONLY.test(dateStr)) {
        res.status(400).json({
          error_code: 'INVALID_DATE',
          message: `Query parameter 'date' must follow YYYY-MM-DD (Asia/Baku), received '${dateStr}'`,
          correlation_id: req.correlationId,
          timestamp: clock.now().toISOString(),
        });
        return;
      }

      const output = await assessUseCase.evaluateNightFlow({
        dmaId,
        localDateYmd: dateStr,
        nightWindowConfig: OPERATIONAL_BAKU_NIGHT_WINDOW,
      });

      if (!output) {
        res.status(404).json({
          error_code: 'DMA_NOT_FOUND',
          message: `DMA '${dmaId}' not found`,
          correlation_id: req.correlationId,
          timestamp: clock.now().toISOString(),
        });
        return;
      }

      res.status(200).json({
        dma_id: output.dma.dmaId,
        date_azt: output.localDateYmd,
        window_start: output.windowStart.toISOString(),
        window_end: output.windowEnd.toISOString(),
        avg_pressure_bar: output.avgPressureBar ?? null,
        status: output.mnf.status,
        is_within_night_window: output.mnf.isWithinNightWindow,
        sample_count: output.mnf.sampleCount,
        coverage_ratio: output.mnf.coverageRatio,
        percentile_5_flow_m3h: output.mnf.percentile5FlowM3h,
        baseline_mnf_m3h: output.mnf.historicalBaselineMnfM3h,
        anomaly_threshold_m3h: output.mnf.anomalyThresholdM3h,
        excess_night_flow_m3h: output.mnf.excessNightFlowM3h,
        is_anomaly_detected: output.mnf.isAnomalyDetected,
        detection_reason: output.mnf.detectionReason,
        methodology_note: output.mnf.methodologyNote,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /v1/dma/:dmaId/assess (dispatcher only; opens reviewable DETECTED incident from persisted LIVE readings)
  v1.post('/dma/:dmaId/assess', requireAuth(deps.config, ['dispatcher']), async (req, res, next) => {
    try {
      const dmaId = String(req.params.dmaId);
      const schema = z.object({
        date: z.string().regex(ISO_DATE_ONLY).optional(),
        pipe_segment_id: z.string().max(64).optional(),
      });
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error_code: 'INVALID_ASSESS_PAYLOAD',
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          correlation_id: req.correlationId,
          timestamp: clock.now().toISOString(),
        });
        return;
      }

      const dateStr = parsed.data.date ?? getLocalDateKey(clock.now());
      const output = await assessUseCase.assessAndOpenIncidentIfNeeded({
        dmaId,
        localDateYmd: dateStr,
        nightWindowConfig: OPERATIONAL_BAKU_NIGHT_WINDOW,
        actor: { actorId: req.principal!.actorId, role: 'dispatcher' },
        correlationId: req.correlationId,
        pipeSegmentId: parsed.data.pipe_segment_id,
      });

      if (!output) {
        res.status(404).json({
          error_code: 'DMA_NOT_FOUND',
          message: `DMA '${dmaId}' not found`,
          correlation_id: req.correlationId,
          timestamp: clock.now().toISOString(),
        });
        return;
      }

      res.status(output.incidentCreated ? 201 : 200).json({
        dma_id: dmaId,
        date_azt: dateStr,
        incident_created: output.incidentCreated,
        reason: output.reason,
        incident: output.incident
          ? serializeIncident(output.incident)
          : output.existingActiveIncident
          ? serializeIncident(output.existingActiveIncident)
          : null,
        night_flow: {
          status: output.nightFlow.mnf.status,
          sample_count: output.nightFlow.mnf.sampleCount,
          coverage_ratio: output.nightFlow.mnf.coverageRatio,
          percentile_5_flow_m3h: output.nightFlow.mnf.percentile5FlowM3h,
          baseline_mnf_m3h: output.nightFlow.mnf.historicalBaselineMnfM3h,
          excess_night_flow_m3h: output.nightFlow.mnf.excessNightFlowM3h,
          is_anomaly_detected: output.nightFlow.mnf.isAnomalyDetected,
        },
        correlation_id: req.correlationId,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/incidents
  v1.get('/incidents', requireAuth(deps.config, ['viewer', 'dispatcher']), async (req, res, next) => {
    try {
      const dmaId = req.query.dma_id ? String(req.query.dma_id) : undefined;
      const state = req.query.state ? String(req.query.state) : undefined;
      const incidents = await deps.incidentRepo.getAll({ dmaId, state });
      res.status(200).json({
        incidents: incidents.map(serializeIncident),
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /v1/incidents/:incidentId
  v1.get('/incidents/:incidentId', requireAuth(deps.config, ['viewer', 'dispatcher']), async (req, res, next) => {
    try {
      const incidentId = String(req.params.incidentId);
      const incident = await deps.incidentRepo.getById(incidentId);
      if (!incident) {
        res.status(404).json({
          error_code: 'INCIDENT_NOT_FOUND',
          message: `Incident '${incidentId}' not found`,
          correlation_id: req.correlationId,
          timestamp: clock.now().toISOString(),
        });
        return;
      }
      const auditEvents = await deps.auditRepo.listAuditEvents({
        incidentId: incident.incidentId,
        limit: 100,
      });
      res.status(200).json({
        incident: serializeIncident(incident),
        audit_events: auditEvents.map((a) => ({
          audit_id: a.id,
          timestamp: a.timestamp.toISOString(),
          event_type: a.eventType,
          source_component: a.sourceComponent,
          severity: a.severity,
          actor_id: a.actorId,
          actor_role: a.actorRole,
          correlation_id: a.correlationId,
          dma_id: a.dmaId ?? null,
          incident_id: a.incidentId ?? null,
          message: a.message,
          metadata: a.metadata ?? null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /v1/incidents/:incidentId/transition (dispatcher only; CAS + commandId idempotency + authoritative verification)
  v1.post(
    '/incidents/:incidentId/transition',
    requireAuth(deps.config, ['dispatcher']),
    async (req, res, next) => {
      try {
        const parsed = TransitionBodySchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error_code: 'INVALID_TRANSITION_PAYLOAD',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
            correlation_id: req.correlationId,
            timestamp: clock.now().toISOString(),
          });
          return;
        }

        const body = parsed.data;
        const commandId =
          req.header('Idempotency-Key')?.trim() || body.command_id?.trim() || '';

        if (!commandId) {
          res.status(400).json({
            error_code: 'MISSING_COMMAND_ID',
            message: 'Provide command_id in request body or Idempotency-Key HTTP header',
            correlation_id: req.correlationId,
            timestamp: clock.now().toISOString(),
          });
          return;
        }

        const incidentId = String(req.params.incidentId);
        let domainEvent: IncidentEvent;

        switch (body.event_type) {
          case 'ASSIGN':
            domainEvent = {
              type: 'ASSIGN',
              crew: {
                crewId: body.payload.crew_id,
                crewName: body.payload.crew_name,
                crewPhone: body.payload.crew_phone,
                role: body.payload.role,
                etaMinutes: body.payload.eta_minutes,
              },
            };
            break;

          case 'MARK_FALSE_ALARM':
            domainEvent = {
              type: 'MARK_FALSE_ALARM',
              reason: body.payload.reason,
            };
            break;

          case 'START_REPAIR':
            domainEvent = {
              type: 'START_REPAIR',
              technicianId: body.payload.technician_id,
              checkInGps: body.payload.check_in_gps,
            };
            break;

          case 'RECORD_REPAIR_EVIDENCE':
            domainEvent = {
              type: 'RECORD_REPAIR_EVIDENCE',
              evidence: {
                technicianId: body.payload.technician_id,
                repairMethod: body.payload.repair_method,
                clampType: body.payload.clamp_type,
                acousticFreqHz: body.payload.acoustic_freq_hz,
                photoFixtureRef: body.payload.photo_fixture_ref,
                technicianNotes: body.payload.technician_notes,
              },
            };
            break;

          case 'EVALUATE_VERIFICATION': {
            const incident = await deps.incidentRepo.getById(incidentId);
            if (!incident) {
              res.status(404).json({
                error_code: 'INCIDENT_NOT_FOUND',
                message: `Incident '${incidentId}' not found`,
                correlation_id: req.correlationId,
                timestamp: clock.now().toISOString(),
              });
              return;
            }
            const dma = await deps.telemetryRepo.getDma(incident.dmaId);
            const authoritativeBaseline =
              dma?.baselineMnfM3h ?? body.payload.baseline_mnf_m3h ?? 0;

            let preWindow: VerificationWindowEvidence | undefined;
            let postWindow: VerificationWindowEvidence | undefined;

            if (body.payload.pre_repair_date && body.payload.post_repair_date) {
              // Server loads persisted nocturnal telemetry windows directly from PostgreSQL
              const preEval = await assessUseCase.evaluateNightFlow({
                dmaId: incident.dmaId,
                localDateYmd: body.payload.pre_repair_date,
                nightWindowConfig: OPERATIONAL_BAKU_NIGHT_WINDOW,
              });
              const postEval = await assessUseCase.evaluateNightFlow({
                dmaId: incident.dmaId,
                localDateYmd: body.payload.post_repair_date,
                nightWindowConfig: OPERATIONAL_BAKU_NIGHT_WINDOW,
              });

              if (preEval) {
                preWindow = {
                  windowStart: preEval.windowStart,
                  windowEnd: preEval.windowEnd,
                  sampleCount: preEval.mnf.sampleCount,
                  coverageRatio: preEval.mnf.coverageRatio,
                  mnfM3h: preEval.mnf.percentile5FlowM3h,
                  avgPressureBar: preEval.avgPressureBar,
                  provenance: `POSTGRES_TELEMETRY:${incident.dmaId}:${body.payload.pre_repair_date}`,
                };
              }
              if (postEval) {
                postWindow = {
                  windowStart: postEval.windowStart,
                  windowEnd: postEval.windowEnd,
                  sampleCount: postEval.mnf.sampleCount,
                  coverageRatio: postEval.mnf.coverageRatio,
                  mnfM3h: postEval.mnf.percentile5FlowM3h,
                  avgPressureBar: postEval.avgPressureBar,
                  provenance: `POSTGRES_TELEMETRY:${incident.dmaId}:${body.payload.post_repair_date}`,
                };
              }
            } else if (body.payload.pre_repair_window && body.payload.post_repair_window) {
              preWindow = mapApiWindowToDomain(body.payload.pre_repair_window);
              postWindow = mapApiWindowToDomain(body.payload.post_repair_window);
            }

            if (!preWindow || !postWindow) {
              res.status(422).json({
                error_code: 'INSUFFICIENT_EVIDENCE',
                message:
                  'Verification requires either (pre_repair_date, post_repair_date) backed by persisted telemetry or structured (pre_repair_window, post_repair_window) evidence',
                correlation_id: req.correlationId,
                timestamp: clock.now().toISOString(),
              });
              return;
            }

            domainEvent = {
              type: 'EVALUATE_VERIFICATION',
              evidence: {
                preRepairWindow: preWindow,
                postRepairWindow: postWindow,
                baselineMnfM3h: authoritativeBaseline,
                leakageExponent: body.payload.leakage_exponent,
                // Note: caller-supplied is_successful / claimed_success is intentionally NOT trusted
              },
            };
            break;
          }

          case 'CLOSE':
            domainEvent = {
              type: 'CLOSE',
              notes: body.payload.notes,
            };
            break;
        }

        const outcome = await transitionUseCase.execute({
          incidentId,
          commandId,
          expectedVersion: body.expected_version,
          event: domainEvent,
          actor: {
            actorId: req.principal!.actorId,
            role: 'dispatcher',
          },
          correlationId: req.correlationId,
          beforeCommitHook: deps.beforeTransitionCommitHook,
        });

        if (!outcome.ok) {
          res.status(outcome.statusCode).json({
            error_code: outcome.errorCode,
            message: outcome.error,
            current_version: outcome.currentVersion ?? null,
            correlation_id: outcome.correlationId,
            timestamp: clock.now().toISOString(),
          });
          return;
        }

        res.status(outcome.statusCode).json({
          incident: serializeIncident(outcome.incident),
          transition_description: outcome.transitionDescription,
          idempotent_replay: outcome.idempotentReplay,
          correlation_id: outcome.correlationId,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /v1/allocation/solve
  v1.post('/allocation/solve', requireAuth(deps.config, ['viewer', 'dispatcher']), async (req, res, next) => {
    try {
      const parsed = AllocationBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error_code: 'INVALID_ALLOCATION_PAYLOAD',
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          correlation_id: req.correlationId,
          timestamp: clock.now().toISOString(),
        });
        return;
      }

      const body = parsed.data;
      const plan = allocateConstrainedWater(
        body.consumers.map((c) => ({
          id: c.id,
          name: c.name,
          region: c.region,
          demandM3: c.demand_m3,
          weight: c.priority_weight,
          canalCapacityM3: c.canal_capacity_m3,
          minimumSurvivalM3: c.minimum_survival_m3,
        })),
        body.available_water_m3,
        {
          volumeUnit: body.volume_unit,
          deliveryHorizonHours: body.delivery_horizon_hours,
          infeasibleMinimumsPolicy: body.infeasible_minimums_policy,
        }
      );

      let runId: string | null = null;
      if (req.principal!.role === 'dispatcher') {
        runId = await deps.auditRepo.saveAllocationRun({
          regionId: body.region_id,
          canalNetworkId: body.canal_network_id,
          actorId: req.principal!.actorId,
          correlationId: req.correlationId,
          plan,
        });
      }

      res.status(200).json({
        run_id: runId,
        status: plan.status,
        volume_unit: plan.volumeUnit,
        delivery_horizon_hours: plan.deliveryHorizonHours,
        total_supply_m3: plan.totalSupplyM3,
        total_allocated_m3: plan.totalAllocatedM3,
        total_demand_m3: plan.totalDemandM3,
        unmet_demand_m3: plan.unmetDemandM3,
        residual_supply_m3: plan.residualSupplyM3,
        gini_index: plan.giniIndex,
        gini_note: plan.giniNote,
        policy_description: plan.policyDescription,
        solve_duration_ms: plan.solveDurationMs,
        allocations: plan.allocations.map((a) => ({
          consumer_id: a.id,
          name: a.name,
          region: a.region,
          demand_m3: a.demandM3,
          canal_capacity_m3: a.canalCapacityM3,
          weight: a.weight,
          allocated_m3: a.allocatedM3,
          unmet_m3: a.unmetM3,
          satisfaction_pct: a.satisfactionPct,
          reason_code: a.reasonCode,
        })),
        correlation_id: req.correlationId,
      });
    } catch (err) {
      if (err instanceof AllocationValidationError) {
        const status = err.reasonCode === 'INFEASIBLE_MINIMUMS' ? 422 : 400;
        res.status(status).json({
          error_code: err.reasonCode,
          message: err.message,
          correlation_id: req.correlationId,
          timestamp: clock.now().toISOString(),
        });
        return;
      }
      next(err);
    }
  });

  // POST /v1/savings/estimate
  v1.post('/savings/estimate', requireAuth(deps.config, ['viewer', 'dispatcher']), async (req, res, next) => {
    try {
      const parsed = SavingsBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error_code: 'INVALID_SAVINGS_PAYLOAD',
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          correlation_id: req.correlationId,
          timestamp: clock.now().toISOString(),
        });
        return;
      }
      const b = parsed.data;
      const result = estimateIllustrativeSavings({
        baselineFlowM3h: b.baseline_flow_m3h,
        baselinePressureBar: b.baseline_pressure_bar,
        postRepairFlowM3h: b.post_repair_flow_m3h,
        postRepairPressureBar: b.post_repair_pressure_bar,
        leakageExponent: b.leakage_exponent,
        illustrativeTariffAznM3: b.illustrative_tariff_azn_m3,
        timeHorizonDays: b.time_horizon_days,
      });

      res.status(200).json({
        baseline_flow_m3h: result.baselineFlowM3h,
        baseline_pressure_bar: result.baselinePressureBar,
        post_repair_flow_m3h: result.postRepairFlowM3h,
        post_repair_pressure_bar: result.postRepairPressureBar,
        leakage_exponent: result.leakageExponent,
        normalized_baseline_flow_m3h: result.normalizedBaselineFlowM3h,
        raw_flow_difference_m3h: result.rawFlowDifferenceM3h,
        pressure_adjusted_hourly_savings_m3h: result.pressureAdjustedHourlySavingsM3h,
        daily_savings_m3: result.dailySavingsM3,
        projected_annual_savings_m3: result.projectedAnnualSavingsM3,
        daily_economic_value_azn: result.dailyEconomicValueAzn,
        projected_annual_economic_value_azn: result.projectedAnnualEconomicValueAzn,
        illustrative_tariff_azn_m3: result.illustrativeTariffAznM3,
        time_horizon_days: result.timeHorizonDays,
        is_modeled_reduction_positive: result.isModeledReductionPositive,
        uncertainty_margin_pct: result.uncertaintyMarginPct,
        model_qualification: result.modelQualification,
        disclaimers: result.disclaimers,
        correlation_id: req.correlationId,
      });
    } catch (err) {
      if (err instanceof SavingsValidationError) {
        res.status(400).json({
          error_code: err.code,
          message: err.message,
          correlation_id: req.correlationId,
          timestamp: clock.now().toISOString(),
        });
        return;
      }
      next(err);
    }
  });

  // GET /v1/audit
  v1.get('/audit', requireAuth(deps.config, ['viewer', 'dispatcher']), async (req, res, next) => {
    try {
      const dmaId = req.query.dma_id ? String(req.query.dma_id) : undefined;
      const incidentId = req.query.incident_id ? String(req.query.incident_id) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const events = await deps.auditRepo.listAuditEvents({ dmaId, incidentId, limit });
      res.status(200).json({
        audit_events: events.map((a) => ({
          audit_id: a.id,
          timestamp: a.timestamp.toISOString(),
          event_type: a.eventType,
          source_component: a.sourceComponent,
          severity: a.severity,
          actor_id: a.actorId,
          actor_role: a.actorRole,
          correlation_id: a.correlationId,
          dma_id: a.dmaId ?? null,
          incident_id: a.incidentId ?? null,
          message: a.message,
          metadata: a.metadata ?? null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // Outbox inspection & manual dispatch trigger (dispatcher only)
  v1.get('/outbox', requireAuth(deps.config, ['dispatcher']), async (_req, res, next) => {
    try {
      if (!deps.outboxDispatcher) {
        res.status(200).json({ outbox: [] });
        return;
      }
      const rows = await deps.outboxDispatcher.listOutbox(50);
      res.status(200).json({
        outbox: rows.map((r) => ({
          outbox_id: r.outboxId,
          idempotency_key: r.idempotencyKey,
          incident_id: r.incidentId,
          dma_id: r.dmaId,
          recipient: r.recipient,
          severity: r.severity,
          status: r.status,
          attempts: r.attempts,
          max_attempts: r.maxAttempts,
          last_error: r.lastError,
          created_at: r.createdAt.toISOString(),
          delivered_at: r.deliveredAt ? r.deliveredAt.toISOString() : null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  v1.post('/outbox/dispatch', requireAuth(deps.config, ['dispatcher']), async (req, res, next) => {
    try {
      if (!deps.outboxDispatcher) {
        res.status(200).json({ processed: 0, delivered: 0, retried: 0, dead_lettered: 0 });
        return;
      }
      const summary = await deps.outboxDispatcher.processDue({
        ignoreSchedule: Boolean(req.body?.ignore_schedule),
      });
      res.status(200).json({
        processed: summary.processed,
        delivered: summary.delivered,
        retried: summary.retried,
        dead_lettered: summary.deadLettered,
        correlation_id: req.correlationId,
      });
    } catch (err) {
      next(err);
    }
  });

  app.use('/v1', v1);

  // Global error handler (distinguishes DB unavailability from unexpected errors; zero secret leakage)
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (isDatabaseUnavailableError(err)) {
      res.status(503).json({
        error_code: 'DATABASE_UNAVAILABLE',
        message: 'PostgreSQL persistence store is currently unavailable; write was not acknowledged',
        correlation_id: req.correlationId,
        timestamp: clock.now().toISOString(),
      });
      return;
    }

    const msg = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({
      error_code: 'INTERNAL_SERVER_ERROR',
      message: msg,
      correlation_id: req.correlationId,
      timestamp: clock.now().toISOString(),
    });
  });

  return app;
}
