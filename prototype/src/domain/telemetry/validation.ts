/**
 * Telemetry Ingestion & Validation Logic (Lecture 3: Design by Contract)
 * Pure domain validation rules for edge telemetry observations.
 *
 * SAMT v1.1.0 Hardening:
 * - Enforces known ACTIVE meters, device-to-meter & meter-to-DMA binding,
 *   metric-to-meter-role compatibility, and canonical units.
 * - Separates observedAt, transmittedAt, and server-owned receivedAt (from Clock).
 * - Separates clock drift policy (transmittedAt skew / future observedAt > 15 min)
 *   from bounded historical observation age (15 min < age <= 72h -> HISTORICAL_REPLAY,
 *   derived by server policy; age > 72h -> REJECTED).
 * - Caller-supplied historical hint CANNOT bypass authentication, binding, or bounds.
 * - Deduplication uses an injectable ObservationDedupStore (backed by PostgreSQL in
 *   production/server mode rather than only a process-local Set).
 */

import type { Clock } from '../ports/Clock.js';
import type {
  CanonicalUnit,
  IngestionMode,
  MeterRegistry,
  MeterRole,
  MetricType,
  ObservationDedupStore,
  ObservationQuality,
  TelemetryObservation,
  TelemetryObservationInput,
} from '../ports/TelemetryPort.js';
import { METRIC_CANONICAL_UNITS } from '../ports/TelemetryPort.js';

export interface ValidationOptions {
  /** Maximum tolerated live clock drift / future skew in minutes (default: 15) */
  maxClockDriftMinutes?: number;
  /** Maximum tolerated age for authenticated historical backlog in hours (default: 72) */
  maxHistoricalAgeHours?: number;
  /** Whether authenticated historical backlog within maxHistoricalAgeHours is accepted (default: true) */
  allowHistoricalReplay?: boolean;
  /** Transport authentication result derived by server/gateway (never trusted from payload) */
  clientAuthenticated?: boolean;
  /** @deprecated Alias for clientAuthenticated */
  clientCertificateValid?: boolean;
  /** Authoritative authenticated deviceId from server credentials (enforces device binding) */
  authenticatedDeviceId?: string;
  /** Injectable deduplication store (defaults to local Set for unit tests) */
  dedupStore?: ObservationDedupStore;
}

export type ValidationOutcomeCode =
  | 'ACCEPTED_LIVE'
  | 'ACCEPTED_HISTORICAL_REPLAY'
  | 'DUPLICATE'
  | 'UNAUTHENTICATED'
  | 'INVALID_PAYLOAD'
  | 'UNKNOWN_METER'
  | 'INACTIVE_METER'
  | 'BINDING_MISMATCH'
  | 'INCOMPATIBLE_METRIC_OR_UNIT'
  | 'INVALID_VALUE'
  | 'CLOCK_SKEW_QUARANTINED'
  | 'HISTORICAL_AGE_EXCEEDED'
  | 'HISTORICAL_NOT_ALLOWED';

export interface ValidationResult {
  accepted: boolean;
  code: ValidationOutcomeCode;
  quality: ObservationQuality;
  ingestionMode: IngestionMode;
  canonicalUnit?: CanonicalUnit;
  receivedAt: Date;
  reason?: string;
  isHistoricalReplay: boolean;
  normalizedObservation?: TelemetryObservation;
}

const ROLE_ALLOWED_METRICS: Record<MeterRole, MetricType[]> = {
  INLET: ['FLOW_M3H'],
  OUTLET: ['FLOW_M3H'],
  CONSUMER: ['FLOW_M3H'],
  PRESSURE_MONITOR: ['PRESSURE_BAR'],
};

export class InMemoryObservationDedupStore implements ObservationDedupStore {
  private seen = new Set<string>();

  has(meterId: string, observationId: string): boolean {
    return this.seen.has(`${meterId}::${observationId}`);
  }

  add(meterId: string, observationId: string): void {
    this.seen.add(`${meterId}::${observationId}`);
  }

  clear(): void {
    this.seen.clear();
  }
}

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && Number.isFinite(d.getTime());
}

export class TelemetryValidator {
  private dedupStore: ObservationDedupStore;

  constructor(
    private clock: Clock,
    private registry: MeterRegistry,
    private options: ValidationOptions = {}
  ) {
    this.dedupStore = options.dedupStore ?? new InMemoryObservationDedupStore();
  }

  /**
   * Synchronous validation helper for pure domain/unit usage with synchronous dedup stores.
   */
  validate(
    observation: TelemetryObservationInput | TelemetryObservation,
    overrideOptions?: Partial<ValidationOptions>
  ): ValidationResult {
    const opts = { ...this.options, ...overrideOptions };
    const pre = this.validateStateless(observation, opts);
    if (!pre.accepted) {
      return pre;
    }

    const alreadySeen = this.dedupStore.has(observation.meterId, observation.observationId);
    if (alreadySeen instanceof Promise) {
      throw new Error('Use validateAsync() when using an asynchronous ObservationDedupStore');
    }
    if (alreadySeen) {
      return {
        accepted: false,
        code: 'DUPLICATE',
        quality: 'REJECTED',
        ingestionMode: pre.ingestionMode,
        canonicalUnit: pre.canonicalUnit,
        receivedAt: pre.receivedAt,
        reason: `Duplicate observation identity: (${observation.meterId}, ${observation.observationId}) already ingested`,
        isHistoricalReplay: pre.isHistoricalReplay,
      };
    }

    this.dedupStore.add(observation.meterId, observation.observationId);
    return pre;
  }

  /**
   * Asynchronous validation supporting durable PostgreSQL deduplication checks.
   */
  async validateAsync(
    observation: TelemetryObservationInput | TelemetryObservation,
    overrideOptions?: Partial<ValidationOptions>
  ): Promise<ValidationResult> {
    const opts = { ...this.options, ...overrideOptions };
    const pre = this.validateStateless(observation, opts);
    if (!pre.accepted) {
      return pre;
    }

    const alreadySeen = await this.dedupStore.has(observation.meterId, observation.observationId);
    if (alreadySeen) {
      return {
        accepted: false,
        code: 'DUPLICATE',
        quality: 'REJECTED',
        ingestionMode: pre.ingestionMode,
        canonicalUnit: pre.canonicalUnit,
        receivedAt: pre.receivedAt,
        reason: `Duplicate observation identity: (${observation.meterId}, ${observation.observationId}) already ingested`,
        isHistoricalReplay: pre.isHistoricalReplay,
      };
    }

    await this.dedupStore.add(observation.meterId, observation.observationId);
    return pre;
  }

  /**
   * Stateless validation of auth, identity, binding, units, bounds, and server time policy.
   * Useful when durable deduplication is enforced atomically via PostgreSQL UNIQUE constraint.
   */
  validateStateless(
    observation: TelemetryObservationInput | TelemetryObservation,
    overrideOptions?: Partial<ValidationOptions>
  ): ValidationResult {
    const opts = { ...this.options, ...overrideOptions };
    const receivedAt = this.clock.now();
    const nowMs = receivedAt.getTime();
    const maxDriftMin = opts.maxClockDriftMinutes ?? 15;
    const maxDriftMs = maxDriftMin * 60 * 1000;
    const maxHistHours = opts.maxHistoricalAgeHours ?? 72;
    const maxHistMs = maxHistHours * 3600 * 1000;
    const allowHistorical = opts.allowHistoricalReplay ?? true;

    // 1. Transport / credential authentication (caller historical flag can NEVER bypass auth)
    const isAuthenticated =
      opts.clientAuthenticated ?? opts.clientCertificateValid ?? true;
    if (!isAuthenticated) {
      return {
        accepted: false,
        code: 'UNAUTHENTICATED',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        receivedAt,
        reason: 'Transport authentication failure: caller device credentials are missing or untrusted',
        isHistoricalReplay: false,
      };
    }

    // 2. Structural identity checks
    if (
      !observation.observationId?.trim() ||
      !observation.meterId?.trim() ||
      !observation.dmaId?.trim() ||
      !observation.deviceId?.trim()
    ) {
      return {
        accepted: false,
        code: 'INVALID_PAYLOAD',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        receivedAt,
        reason: 'Missing mandatory identifier fields (observationId, deviceId, meterId, or dmaId)',
        isHistoricalReplay: false,
      };
    }

    // 3. Authenticated device identity check (cannot spoof another gateway deviceId)
    if (opts.authenticatedDeviceId && observation.deviceId !== opts.authenticatedDeviceId) {
      return {
        accepted: false,
        code: 'BINDING_MISMATCH',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        receivedAt,
        reason: `Authenticated device '${opts.authenticatedDeviceId}' is not authorized to submit telemetry as '${observation.deviceId}'`,
        isHistoricalReplay: false,
      };
    }

    // 4. Timestamp validity (observedAt and optional transmittedAt)
    if (!isValidDate(observation.observedAt)) {
      return {
        accepted: false,
        code: 'INVALID_PAYLOAD',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        receivedAt,
        reason: 'Invalid observedAt timestamp',
        isHistoricalReplay: false,
      };
    }

    const rawTransmitted =
      'transmittedAt' in observation && observation.transmittedAt !== undefined
        ? observation.transmittedAt
        : 'sentAt' in observation && observation.sentAt !== undefined
        ? observation.sentAt
        : receivedAt;

    if (!isValidDate(rawTransmitted)) {
      return {
        accepted: false,
        code: 'INVALID_PAYLOAD',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        receivedAt,
        reason: 'Invalid transmittedAt timestamp',
        isHistoricalReplay: false,
      };
    }

    // 5. Meter registry membership, active status, DMA & device binding
    const meterDef = this.registry.getMeter(observation.meterId);
    if (!meterDef) {
      return {
        accepted: false,
        code: 'UNKNOWN_METER',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        receivedAt,
        reason: `Unknown meter: ${observation.meterId} is not registered in the meter registry`,
        isHistoricalReplay: false,
      };
    }

    if (meterDef.isActive === false) {
      return {
        accepted: false,
        code: 'INACTIVE_METER',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        receivedAt,
        reason: `Inactive meter: ${observation.meterId} is deactivated and cannot accept telemetry`,
        isHistoricalReplay: false,
      };
    }

    if (meterDef.dmaId !== observation.dmaId) {
      return {
        accepted: false,
        code: 'BINDING_MISMATCH',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        receivedAt,
        reason: `Meter-to-DMA mismatch: ${observation.meterId} belongs to ${meterDef.dmaId}, not ${observation.dmaId}`,
        isHistoricalReplay: false,
      };
    }

    if (meterDef.boundDeviceId && meterDef.boundDeviceId !== observation.deviceId) {
      return {
        accepted: false,
        code: 'BINDING_MISMATCH',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        receivedAt,
        reason: `Device-to-meter binding mismatch: ${observation.meterId} is bound to ${meterDef.boundDeviceId}, not ${observation.deviceId}`,
        isHistoricalReplay: false,
      };
    }

    // 6. Metric-to-meter-role compatibility and canonical unit enforcement
    const canonicalUnit = METRIC_CANONICAL_UNITS[observation.metric];
    if (!canonicalUnit) {
      return {
        accepted: false,
        code: 'INCOMPATIBLE_METRIC_OR_UNIT',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        receivedAt,
        reason: `Unsupported metric type: ${String(observation.metric)}`,
        isHistoricalReplay: false,
      };
    }

    const allowedMetrics = meterDef.allowedMetrics ?? ROLE_ALLOWED_METRICS[meterDef.role];
    if (!allowedMetrics.includes(observation.metric)) {
      return {
        accepted: false,
        code: 'INCOMPATIBLE_METRIC_OR_UNIT',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        receivedAt,
        reason: `Metric ${observation.metric} is incompatible with meter ${meterDef.meterId} (role=${meterDef.role}, allowed=[${allowedMetrics.join(', ')}])`,
        isHistoricalReplay: false,
      };
    }

    const suppliedUnit =
      'unit' in observation && observation.unit !== undefined
        ? observation.unit
        : 'canonicalUnit' in observation && observation.canonicalUnit !== undefined
        ? observation.canonicalUnit
        : undefined;
    if (suppliedUnit !== undefined && suppliedUnit !== canonicalUnit) {
      return {
        accepted: false,
        code: 'INCOMPATIBLE_METRIC_OR_UNIT',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        receivedAt,
        reason: `Non-canonical unit '${suppliedUnit}' for metric ${observation.metric}; expected '${canonicalUnit}'`,
        isHistoricalReplay: false,
      };
    }

    // 7. Physical numeric bounds & battery sanity
    if (typeof observation.value !== 'number' || !Number.isFinite(observation.value) || observation.value < 0) {
      return {
        accepted: false,
        code: 'INVALID_VALUE',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        canonicalUnit,
        receivedAt,
        reason: `Physically invalid reading: value ${observation.value} must be finite and non-negative`,
        isHistoricalReplay: false,
      };
    }

    if (
      observation.batteryVolts !== undefined &&
      (!Number.isFinite(observation.batteryVolts) || observation.batteryVolts < 0 || observation.batteryVolts > 12)
    ) {
      return {
        accepted: false,
        code: 'INVALID_VALUE',
        quality: 'REJECTED',
        ingestionMode: 'LIVE',
        canonicalUnit,
        receivedAt,
        reason: `Invalid batteryVolts reading: ${observation.batteryVolts}`,
        isHistoricalReplay: false,
      };
    }

    // 8. Clock drift policy (gateway transmittedAt vs server receivedAt, and future observedAt)
    const observedMs = observation.observedAt.getTime();
    const transmittedMs = rawTransmitted.getTime();

    const transmittedDriftMs = Math.abs(nowMs - transmittedMs);
    if (transmittedDriftMs > maxDriftMs) {
      return {
        accepted: false,
        code: 'CLOCK_SKEW_QUARANTINED',
        quality: 'QUARANTINED',
        ingestionMode: 'LIVE',
        canonicalUnit,
        receivedAt,
        reason: `Gateway clock drift: |transmittedAt - receivedAt| = ${(transmittedDriftMs / 60000).toFixed(1)} min exceeds ${maxDriftMin} min limit`,
        isHistoricalReplay: false,
      };
    }

    if (observedMs > nowMs + maxDriftMs) {
      const futureMin = (observedMs - nowMs) / 60000;
      return {
        accepted: false,
        code: 'CLOCK_SKEW_QUARANTINED',
        quality: 'QUARANTINED',
        ingestionMode: 'LIVE',
        canonicalUnit,
        receivedAt,
        reason: `Future observation skew: observedAt is +${futureMin.toFixed(1)} min ahead of server receivedAt (> ${maxDriftMin} min limit)`,
        isHistoricalReplay: false,
      };
    }

    if (observedMs > transmittedMs + maxDriftMs) {
      return {
        accepted: false,
        code: 'CLOCK_SKEW_QUARANTINED',
        quality: 'QUARANTINED',
        ingestionMode: 'LIVE',
        canonicalUnit,
        receivedAt,
        reason: 'Inconsistent timestamps: observedAt exceeds transmittedAt beyond clock drift tolerance',
        isHistoricalReplay: false,
      };
    }

    // 9. Server-derived live vs bounded historical replay age policy
    const ageMs = nowMs - observedMs;
    const isOlderThanLiveWindow = ageMs > maxDriftMs;

    if (isOlderThanLiveWindow) {
      if (ageMs > maxHistMs) {
        return {
          accepted: false,
          code: 'HISTORICAL_AGE_EXCEEDED',
          quality: 'REJECTED',
          ingestionMode: 'HISTORICAL_REPLAY',
          canonicalUnit,
          receivedAt,
          reason: `Observation age (${(ageMs / 3600000).toFixed(1)}h) exceeds bounded historical replay limit (${maxHistHours}h)`,
          isHistoricalReplay: true,
        };
      }
      if (!allowHistorical) {
        return {
          accepted: false,
          code: 'HISTORICAL_NOT_ALLOWED',
          quality: 'QUARANTINED',
          ingestionMode: 'HISTORICAL_REPLAY',
          canonicalUnit,
          receivedAt,
          reason: `Late observation age (${(ageMs / 60000).toFixed(1)} min > ${maxDriftMin} min) rejected because historical replay is disabled by policy`,
          isHistoricalReplay: true,
        };
      }
    }

    const ingestionMode: IngestionMode = isOlderThanLiveWindow ? 'HISTORICAL_REPLAY' : 'LIVE';

    // 10. Battery health quality assessment
    let quality: ObservationQuality = 'VALID';
    let reason: string | undefined;
    if (observation.batteryVolts !== undefined && observation.batteryVolts < 3.0) {
      quality = 'SUSPECT';
      reason = `Low battery warning: ${observation.batteryVolts}V < 3.0V threshold; accepted with SUSPECT quality`;
    }

    const normalizedObservation: TelemetryObservation = {
      observationId: observation.observationId.trim(),
      deviceId: observation.deviceId.trim(),
      meterId: observation.meterId.trim(),
      dmaId: observation.dmaId.trim(),
      metric: observation.metric,
      canonicalUnit,
      value: observation.value,
      observedAt: new Date(observedMs),
      transmittedAt: new Date(transmittedMs),
      sentAt: new Date(transmittedMs),
      receivedAt: new Date(nowMs),
      quality,
      qualityReason: reason,
      ingestionMode,
      batteryVolts: observation.batteryVolts,
    };

    return {
      accepted: true,
      code: ingestionMode === 'HISTORICAL_REPLAY' ? 'ACCEPTED_HISTORICAL_REPLAY' : 'ACCEPTED_LIVE',
      quality,
      ingestionMode,
      canonicalUnit,
      receivedAt,
      reason,
      isHistoricalReplay: ingestionMode === 'HISTORICAL_REPLAY',
      normalizedObservation,
    };
  }

  resetDuplicateFilter(): void {
    this.dedupStore.clear?.();
  }
}
