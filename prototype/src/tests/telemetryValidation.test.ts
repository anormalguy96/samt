import { describe, it, expect, beforeEach } from 'vitest';
import { FixedClock } from '../domain/ports/Clock';
import { StandardMeterRegistry } from '../domain/adapters/StandardMeterRegistry';
import { TelemetryValidator } from '../domain/telemetry/validation';
import type { TelemetryObservation } from '../domain/ports/TelemetryPort';

describe('Telemetry Ingestion & Validation (DbC Contracts & Robustness)', () => {
  let clock: FixedClock;
  let registry: StandardMeterRegistry;
  let validator: TelemetryValidator;

  beforeEach(() => {
    // Fixed clock at 14:00 AZT (UTC+4: 10:00 UTC)
    clock = new FixedClock('2026-10-20T10:00:00Z');
    registry = new StandardMeterRegistry();
    validator = new TelemetryValidator(clock, registry, {
      maxClockDriftMinutes: 15,
      clientCertificateValid: true,
    });
  });

  const createBaseObservation = (overrides: Partial<TelemetryObservation> = {}): TelemetryObservation => ({
    observationId: 'obs-001',
    deviceId: 'DEV-YAS-01',
    meterId: 'FM-YAS-INLET-01',
    dmaId: 'DMA-YASAMAL-04',
    metric: 'FLOW_M3H',
    value: 412.5,
    observedAt: clock.now(),
    receivedAt: clock.now(),
    quality: 'VALID',
    batteryVolts: 3.4,
    ...overrides,
  });

  it('accepts valid observations conforming to all precondition bounds', () => {
    const obs = createBaseObservation();
    const result = validator.validate(obs);

    expect(result.accepted).toBe(true);
    expect(result.quality).toBe('VALID');
    expect(result.isHistoricalReplay).toBe(false);
  });

  it('rejects duplicate observation identities', () => {
    const obs = createBaseObservation({ observationId: 'obs-duplicate-id' });
    const first = validator.validate(obs);
    expect(first.accepted).toBe(true);

    const second = validator.validate(obs);
    expect(second.accepted).toBe(false);
    expect(second.quality).toBe('REJECTED');
    expect(second.reason).toContain('Duplicate observation identity');
  });

  it('rejects observations from unknown meters not present in registry', () => {
    const obs = createBaseObservation({
      observationId: 'obs-unregistered',
      meterId: 'FM-ROGUE-METER-999',
    });
    const result = validator.validate(obs);

    expect(result.accepted).toBe(false);
    expect(result.quality).toBe('REJECTED');
    expect(result.reason).toContain('Unknown meter');
  });

  it('rejects physically impossible negative flow or pressure readings', () => {
    const obs = createBaseObservation({
      observationId: 'obs-negative-val',
      value: -15.4,
    });
    const result = validator.validate(obs);

    expect(result.accepted).toBe(false);
    expect(result.quality).toBe('REJECTED');
    expect(result.reason).toContain('Physically invalid reading');
  });

  it('quarantines readings with future clock skew > 15 minutes', () => {
    // Observation timestamped 25 minutes into the future
    const futureTime = new Date(clock.now().getTime() + 25 * 60 * 1000);
    const obs = createBaseObservation({
      observationId: 'obs-future-skew',
      observedAt: futureTime,
    });
    const result = validator.validate(obs);

    expect(result.accepted).toBe(false);
    expect(result.quality).toBe('QUARANTINED');
    expect(result.reason).toContain('Clock skew in future');
  });

  it('handles 48-hour reconnection outage: historical replay is accepted when flagged', () => {
    // 36 hours in the past
    const outageTime = new Date(clock.now().getTime() - 36 * 3600 * 1000);
    
    // Without replay flag: quarantined as unexpected late arrival
    const regularValidator = new TelemetryValidator(clock, registry, { allowHistoricalReplay: false });
    const quarantined = regularValidator.validate(createBaseObservation({
      observationId: 'obs-outage-unflagged',
      observedAt: outageTime,
    }));
    expect(quarantined.accepted).toBe(false);
    expect(quarantined.quality).toBe('QUARANTINED');

    // With historical replay flag enabled: accepted as historical data
    const replayValidator = new TelemetryValidator(clock, registry, { allowHistoricalReplay: true });
    const accepted = replayValidator.validate(createBaseObservation({
      observationId: 'obs-outage-flagged',
      observedAt: outageTime,
    }));
    expect(accepted.accepted).toBe(true);
    expect(accepted.isHistoricalReplay).toBe(true);
  });

  it('flags observation as SUSPECT when battery voltage is low (< 3.0V)', () => {
    const obs = createBaseObservation({
      observationId: 'obs-low-battery',
      batteryVolts: 2.7,
    });
    const result = validator.validate(obs);

    expect(result.accepted).toBe(true);
    expect(result.quality).toBe('SUSPECT');
    expect(result.reason).toContain('Low battery warning');
  });

  it('simulates transport authentication failure when client certificate is untrusted', () => {
    const unauthValidator = new TelemetryValidator(clock, registry, { clientCertificateValid: false });
    const obs = createBaseObservation({ observationId: 'obs-unauth' });
    const result = unauthValidator.validate(obs);

    expect(result.accepted).toBe(false);
    expect(result.quality).toBe('REJECTED');
    expect(result.reason).toContain('Transport authentication failure');
  });
});
