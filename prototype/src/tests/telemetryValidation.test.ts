import { describe, it, expect, beforeEach } from 'vitest';
import { FixedClock } from '../domain/ports/Clock';
import { StandardMeterRegistry } from '../domain/adapters/StandardMeterRegistry';
import { TelemetryValidator } from '../domain/telemetry/validation';
import type { TelemetryObservationInput } from '../domain/ports/TelemetryPort';

describe('Telemetry Identity, Binding, Time & Historical Policy (SAMT v1.1.0)', () => {
  let clock: FixedClock;
  let registry: StandardMeterRegistry;
  let validator: TelemetryValidator;

  beforeEach(() => {
    clock = new FixedClock('2026-10-20T10:00:00Z'); // 14:00 AZT
    registry = new StandardMeterRegistry();
    validator = new TelemetryValidator(clock, registry, {
      maxClockDriftMinutes: 15,
      maxHistoricalAgeHours: 72,
      clientAuthenticated: true,
      authenticatedDeviceId: 'GW-YAS-01',
    });
  });

  const makeObs = (overrides: Partial<TelemetryObservationInput> = {}): TelemetryObservationInput => ({
    observationId: 'obs-001',
    deviceId: 'GW-YAS-01',
    meterId: 'FM-YAS-INLET-01',
    dmaId: 'DMA-YASAMAL-04',
    metric: 'FLOW_M3H',
    unit: 'm3/h',
    value: 112.5,
    observedAt: clock.now(),
    transmittedAt: clock.now(),
    batteryVolts: 3.6,
    ...overrides,
  });

  it('accepts valid bound live reading and derives server-owned receivedAt', () => {
    const res = validator.validate(makeObs());
    expect(res.accepted).toBe(true);
    expect(res.code).toBe('ACCEPTED_LIVE');
    expect(res.quality).toBe('VALID');
    expect(res.ingestionMode).toBe('LIVE');
    expect(res.receivedAt.toISOString()).toBe('2026-10-20T10:00:00.000Z');
  });

  it('rejects duplicate (meterId, observationId), unknown meters, and inactive meters', () => {
    expect(validator.validate(makeObs({ observationId: 'dup-1' })).accepted).toBe(true);
    const dup = validator.validate(makeObs({ observationId: 'dup-1' }));
    expect(dup.accepted).toBe(false);
    expect(dup.code).toBe('DUPLICATE');

    const unknown = validator.validate(makeObs({ observationId: 'unk-1', meterId: 'FM-ROGUE-999' }));
    expect(unknown.accepted).toBe(false);
    expect(unknown.code).toBe('UNKNOWN_METER');

    const inactive = validator.validate(makeObs({ observationId: 'inact-1', meterId: 'FM-YAS-INACTIVE-99' }));
    expect(inactive.accepted).toBe(false);
    expect(inactive.code).toBe('INACTIVE_METER');
  });

  it('enforces device-to-meter binding, meter-to-DMA binding, metric role compatibility, and canonical units', () => {
    const wrongDevice = validator.validate(
      makeObs({ observationId: 'b1', meterId: 'FM-YAS-INLET-02' }) // Bound to GW-YAS-02, not GW-YAS-01
    );
    expect(wrongDevice.accepted).toBe(false);
    expect(wrongDevice.code).toBe('BINDING_MISMATCH');

    const wrongDma = validator.validate(makeObs({ observationId: 'b2', dmaId: 'DMA-NASIMI-02' }));
    expect(wrongDma.accepted).toBe(false);
    expect(wrongDma.code).toBe('BINDING_MISMATCH');

    const wrongMetric = validator.validate(makeObs({ observationId: 'b3', metric: 'PRESSURE_BAR', unit: 'bar' }));
    expect(wrongMetric.accepted).toBe(false);
    expect(wrongMetric.code).toBe('INCOMPATIBLE_METRIC_OR_UNIT');

    const wrongUnit = validator.validate(makeObs({ observationId: 'b4', metric: 'FLOW_M3H', unit: 'bar' }));
    expect(wrongUnit.accepted).toBe(false);
    expect(wrongUnit.code).toBe('INCOMPATIBLE_METRIC_OR_UNIT');
  });

  it('rejects negative/non-finite values and quarantines future skew or gateway clock drift', () => {
    const neg = validator.validate(makeObs({ observationId: 'v1', value: -5 }));
    expect(neg.accepted).toBe(false);
    expect(neg.code).toBe('INVALID_VALUE');

    const nan = validator.validate(makeObs({ observationId: 'v2', value: Number.NaN }));
    expect(nan.accepted).toBe(false);
    expect(nan.code).toBe('INVALID_VALUE');

    const futureObs = validator.validate(
      makeObs({
        observationId: 't1',
        observedAt: new Date(clock.now().getTime() + 25 * 60 * 1000),
      })
    );
    expect(futureObs.accepted).toBe(false);
    expect(futureObs.quality).toBe('QUARANTINED');
    expect(futureObs.code).toBe('CLOCK_SKEW_QUARANTINED');

    const driftedGateway = validator.validate(
      makeObs({
        observationId: 't2',
        transmittedAt: new Date(clock.now().getTime() - 30 * 60 * 1000),
      })
    );
    expect(driftedGateway.accepted).toBe(false);
    expect(driftedGateway.quality).toBe('QUARANTINED');
  });

  it('derives bounded historical replay server-side and blocks unauthenticated bypass or >72h age', () => {
    const thirtySixHoursAgo = new Date(clock.now().getTime() - 36 * 3600 * 1000);
    const replay = validator.validate(makeObs({ observationId: 'h1', observedAt: thirtySixHoursAgo }));
    expect(replay.accepted).toBe(true);
    expect(replay.ingestionMode).toBe('HISTORICAL_REPLAY');
    expect(replay.isHistoricalReplay).toBe(true);

    const eightyHoursAgo = new Date(clock.now().getTime() - 80 * 3600 * 1000);
    const tooOld = validator.validate(
      makeObs({ observationId: 'h2', observedAt: eightyHoursAgo, callerHistoricalHint: true })
    );
    expect(tooOld.accepted).toBe(false);
    expect(tooOld.code).toBe('HISTORICAL_AGE_EXCEEDED');

    // Caller historical flag CANNOT bypass authentication
    const unauth = validator.validate(
      makeObs({ observationId: 'h3', observedAt: thirtySixHoursAgo, callerHistoricalHint: true }),
      { clientAuthenticated: false }
    );
    expect(unauth.accepted).toBe(false);
    expect(unauth.code).toBe('UNAUTHENTICATED');
  });

  it('flags low battery (< 3.0V) as SUSPECT while accepting valid reading', () => {
    const res = validator.validate(makeObs({ observationId: 'bat-1', batteryVolts: 2.7 }));
    expect(res.accepted).toBe(true);
    expect(res.quality).toBe('SUSPECT');
  });
});
