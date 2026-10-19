/**
 * Telemetry Ingestion & Validation Logic (Lecture 3: Design by Contract)
 * Pure domain validation rules for edge telemetry observations.
 * Does NOT import React, browser timers, or network libraries.
 */

import type { Clock } from '../ports/Clock';
import type { 
  TelemetryObservation, 
  ObservationQuality, 
  MeterRegistry 
} from '../ports/TelemetryPort';

export interface ValidationOptions {
  allowHistoricalReplay?: boolean; // For buffered loggers uploading after an outage
  maxClockDriftMinutes?: number;  // Default: 15 minutes
  clientCertificateValid?: boolean; // Transport authentication simulation
}

export interface ValidationResult {
  accepted: boolean;
  quality: ObservationQuality;
  reason?: string;
  isHistoricalReplay: boolean;
}

export class TelemetryValidator {
  private knownObservationIds = new Set<string>();

  constructor(
    private clock: Clock,
    private registry: MeterRegistry,
    private options: ValidationOptions = {}
  ) {}

  validate(observation: TelemetryObservation): ValidationResult {
    const maxDrift = this.options.maxClockDriftMinutes ?? 15;
    const now = this.clock.now().getTime();
    const observedTime = observation.observedAt.getTime();
    const driftMinutes = Math.abs(now - observedTime) / (60 * 1000);

    // 1. Structural validity
    if (!observation.observationId || !observation.meterId || !observation.dmaId) {
      return {
        accepted: false,
        quality: 'REJECTED',
        reason: 'Missing mandatory identifier fields (observationId, meterId, or dmaId)',
        isHistoricalReplay: false,
      };
    }

    // 2. Duplicate observation identity check
    if (this.knownObservationIds.has(observation.observationId)) {
      return {
        accepted: false,
        quality: 'REJECTED',
        reason: `Duplicate observation identity: ${observation.observationId} already ingested`,
        isHistoricalReplay: false,
      };
    }

    // 3. Simulated Transport Authentication Check
    // (Explicitly labeled as simulated auth check, NOT pretending a live mTLS handshake occurred)
    if (this.options.clientCertificateValid === false) {
      return {
        accepted: false,
        quality: 'REJECTED',
        reason: 'Transport authentication failure: Simulated device certificate is invalid or untrusted',
        isHistoricalReplay: false,
      };
    }

    // 4. Meter Registry check
    const meterDef = this.registry.getMeter(observation.meterId);
    if (!meterDef) {
      return {
        accepted: false,
        quality: 'REJECTED',
        reason: `Unknown meter: ${observation.meterId} is not registered in the DMA meter registry`,
        isHistoricalReplay: false,
      };
    }

    // 5. Physical bounds check
    if (observation.value < 0 || !Number.isFinite(observation.value)) {
      return {
        accepted: false,
        quality: 'REJECTED',
        reason: `Physically invalid reading: value ${observation.value} must be non-negative and finite`,
        isHistoricalReplay: false,
      };
    }

    // 6. Timing and clock drift evaluation
    // Note: Old authenticated readings from a 48/72-hour reconnection outage are historical replay,
    // NOT malicious clock skew. Historical correction must not trigger a fresh live dispatch.
    const isPastReplay = observedTime < now - maxDrift * 60 * 1000;
    const isFutureSkew = observedTime > now + maxDrift * 60 * 1000;

    if (isFutureSkew) {
      return {
        accepted: false,
        quality: 'QUARANTINED',
        reason: `Clock skew in future: |Δt| = ${driftMinutes.toFixed(1)} min exceeds threshold (${maxDrift} min)`,
        isHistoricalReplay: false,
      };
    }

    if (isPastReplay && !this.options.allowHistoricalReplay) {
      return {
        accepted: false,
        quality: 'QUARANTINED',
        reason: `Late arrival / out-of-window packet: |Δt| = ${driftMinutes.toFixed(1)} min > ${maxDrift} min without replay flag`,
        isHistoricalReplay: true,
      };
    }

    // 7. Battery health check
    let quality: ObservationQuality = 'VALID';
    let reason: string | undefined;

    if (observation.batteryVolts !== undefined && observation.batteryVolts < 3.0) {
      quality = 'SUSPECT';
      reason = `Low battery warning: ${observation.batteryVolts}V < 3.0V threshold; observation accepted with SUSPECT quality bit`;
    }

    // Record identity
    this.knownObservationIds.add(observation.observationId);

    return {
      accepted: true,
      quality,
      reason,
      isHistoricalReplay: isPastReplay,
    };
  }

  resetDuplicateFilter(): void {
    this.knownObservationIds.clear();
  }
}
