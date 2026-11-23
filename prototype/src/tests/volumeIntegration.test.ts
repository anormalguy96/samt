import { describe, it, expect } from 'vitest';
import {
  integrateFlowVolume,
  integrateMultipleMeters,
  type FlowSample,
} from '../domain/balance/flowIntegration';
import { calculateWaterBalance } from '../domain/balance/waterBalance';

describe('Clipped Trapezoidal Flow Integration & Water Balance (SAMT v1.1.0)', () => {
  it('61 endpoint samples at 15s spacing over 15 min at 100 m³/h yields 25.0 m³ purely measured', () => {
    const windowStart = new Date('2026-10-20T03:00:00Z');
    const windowEnd = new Date('2026-10-20T03:15:00Z');
    const samples: FlowSample[] = [];
    for (let i = 0; i <= 60; i++) {
      samples.push({
        timestamp: new Date(windowStart.getTime() + i * 15 * 1000),
        flowM3h: 100.0,
      });
    }

    const result = integrateFlowVolume(samples, {
      windowStart,
      windowEnd,
      expectedSampleIntervalSec: 15,
    });

    expect(result.status).toBe('COMPLETE');
    expect(result.measuredVolumeM3).toBeCloseTo(25.0, 4);
    expect(result.estimatedBoundaryVolumeM3).toBe(0);
    expect(result.totalVolumeM3).toBeCloseTo(25.0, 4);
    expect(result.coverageRatio).toBeCloseTo(1.0, 4);
    expect(result.isCompleteCoverage).toBe(true);
  });

  it('60 samples starting at t=0 (14m45s): distinguishes measured vs bounded boundary hold', () => {
    const windowStart = new Date('2026-10-20T03:00:00Z');
    const windowEnd = new Date('2026-10-20T03:15:00Z');
    const samples: FlowSample[] = [];
    for (let i = 0; i < 60; i++) {
      samples.push({
        timestamp: new Date(windowStart.getTime() + i * 15 * 1000),
        flowM3h: 100.0,
      });
    }

    const bounded = integrateFlowVolume(samples, {
      windowStart,
      windowEnd,
      expectedSampleIntervalSec: 15,
      boundaryPolicy: 'BOUNDED_HOLD',
    });
    expect(bounded.measuredVolumeM3).toBeCloseTo(24.5833, 3);
    expect(bounded.estimatedBoundaryVolumeM3).toBeCloseTo(0.4167, 3);
    expect(bounded.totalVolumeM3).toBeCloseTo(25.0, 3);
    expect(bounded.coverageRatio).toBeCloseTo(885 / 900, 3);
    expect(bounded.isCompleteCoverage).toBe(true);

    const strict = integrateFlowVolume(samples, {
      windowStart,
      windowEnd,
      expectedSampleIntervalSec: 15,
      boundaryPolicy: 'STRICT_INTERIOR',
    });
    expect(strict.measuredVolumeM3).toBeCloseTo(24.5833, 3);
    expect(strict.estimatedBoundaryVolumeM3).toBe(0);
    expect(strict.totalVolumeM3).toBeCloseTo(24.5833, 3);
  });

  it('integrates per meter and sums boundary volumes: two inlet meters at 100 m³/h yield 50.0 m³', () => {
    const windowStart = new Date('2026-10-20T03:00:00Z');
    const windowEnd = new Date('2026-10-20T03:15:00Z');
    const makeSeries = () =>
      Array.from({ length: 61 }, (_, i) => ({
        timestamp: new Date(windowStart.getTime() + i * 15 * 1000),
        flowM3h: 100.0,
      }));

    const multi = integrateMultipleMeters(
      new Map([
        ['FM-YAS-INLET-01', makeSeries()],
        ['FM-YAS-INLET-02', makeSeries()],
      ]),
      { windowStart, windowEnd, expectedSampleIntervalSec: 15 }
    );

    expect(multi.totalVolumeM3).toBeCloseTo(50.0, 3);
    expect(multi.measuredVolumeM3).toBeCloseTo(50.0, 3);
    expect(multi.perMeter).toHaveLength(2);
  });

  it('clips samples strictly to the requested window without integrating distant outside readings', () => {
    const windowStart = new Date('2026-10-20T03:00:00Z');
    const windowEnd = new Date('2026-10-20T03:15:00Z');
    const samples: FlowSample[] = [
      { timestamp: new Date('2026-10-20T01:00:00Z'), flowM3h: 999 }, // Far outside: ignored
      { timestamp: windowStart, flowM3h: 100 },
      { timestamp: new Date('2026-10-20T03:07:30Z'), flowM3h: 100 },
      { timestamp: windowEnd, flowM3h: 100 },
      { timestamp: new Date('2026-10-20T05:00:00Z'), flowM3h: 999 }, // Far outside: ignored
    ];

    const res = integrateFlowVolume(samples, { windowStart, windowEnd });
    expect(res.totalVolumeM3).toBeCloseTo(25.0, 3);
    expect(res.outOfWindowSampleCount).toBe(2);
  });

  it('correctly integrates irregular sample intervals with varying flow rates', () => {
    const baseTime = new Date('2026-10-20T02:00:00Z');
    const samples: FlowSample[] = [
      { timestamp: baseTime, flowM3h: 60 },
      { timestamp: new Date(baseTime.getTime() + 5 * 60 * 1000), flowM3h: 120 },
      { timestamp: new Date(baseTime.getTime() + 15 * 60 * 1000), flowM3h: 120 },
    ];

    const result = integrateFlowVolume(samples, {
      windowStart: baseTime,
      windowEnd: new Date(baseTime.getTime() + 15 * 60 * 1000),
    });

    expect(result.totalVolumeM3).toBeCloseTo(27.5, 2);
    expect(result.averageFlowM3h).toBeCloseTo(110.0, 1);
  });

  it('does NOT extrapolate unbounded long gaps and reports honest measured coverageRatio', () => {
    const start = new Date('2026-10-20T02:00:00Z');
    const end = new Date('2026-10-20T03:00:00Z');
    const samples: FlowSample[] = [
      { timestamp: start, flowM3h: 80 },
      { timestamp: new Date(start.getTime() + 5 * 60 * 1000), flowM3h: 80 },
    ];

    const result = integrateFlowVolume(samples, {
      windowStart: start,
      windowEnd: end,
      expectedSampleIntervalSec: 60,
    });

    expect(result.isCompleteCoverage).toBe(false);
    expect(result.status).toBe('INSUFFICIENT_COVERAGE');
    expect(result.coverageRatio).toBeCloseTo(5 / 60, 3);
    expect(result.measuredVolumeM3).toBeCloseTo((80 * 5) / 60, 3);
    expect(result.estimatedBoundaryVolumeM3).toBe(0);
    expect(result.maxGapSeconds).toBeGreaterThan(3000);
  });

  it('handles duplicate timestamps, single points, and malformed values explicitly', () => {
    const start = new Date('2026-10-20T02:00:00Z');
    const end = new Date('2026-10-20T02:15:00Z');

    // Single point must NEVER fabricate full-window volume
    const single = integrateFlowVolume([{ timestamp: start, flowM3h: 100 }], {
      windowStart: start,
      windowEnd: end,
    });
    expect(single.totalVolumeM3).toBe(0);
    expect(single.coverageRatio).toBe(0);
    expect(single.status).toBe('INSUFFICIENT_COVERAGE');

    // Duplicate timestamps averaged deterministically: (80+120)/2 = 100
    const dup = integrateFlowVolume(
      [
        { timestamp: start, flowM3h: 80 },
        { timestamp: start, flowM3h: 120 },
        { timestamp: end, flowM3h: 100 },
      ],
      { windowStart: start, windowEnd: end }
    );
    expect(dup.duplicateTimestampCount).toBe(1);
    expect(dup.totalVolumeM3).toBeCloseTo(25.0, 3);

    // Invalid dates / NaN / negative readings counted and excluded
    const malformed = integrateFlowVolume(
      [
        { timestamp: new Date('invalid'), flowM3h: 50 },
        { timestamp: start, flowM3h: Number.NaN },
        { timestamp: start, flowM3h: -10 },
      ],
      { windowStart: start, windowEnd: end }
    );
    expect(malformed.status).toBe('INVALID_INPUT');
    expect(malformed.invalidSampleCount).toBe(3);
  });

  it('preserves signed unexplained residual and prevents double-counting authorized consumption', () => {
    const start = new Date('2026-10-20T02:00:00Z');
    const end = new Date('2026-10-20T02:15:00Z');

    // Negative residual when storage drains (-10) or outflow > inflow
    const negRes = calculateWaterBalance({
      dmaId: 'DMA-YASAMAL-04',
      dmaName: 'Yasamal',
      windowStart: start,
      windowEnd: end,
      inletContributions: [
        { meterId: 'M1', meterName: 'Inlet', role: 'INLET', volumeM3: 20, averageFlowM3h: 80, coverageRatio: 1 },
      ],
      outletContributions: [
        { meterId: 'M2', meterName: 'Outlet', role: 'OUTLET', volumeM3: 25, averageFlowM3h: 100, coverageRatio: 1 },
      ],
      storageChangeM3: 0,
    });
    expect(negRes.signedResidualM3).toBeCloseTo(-5, 2);
    expect(negRes.evidenceQualification).toContain('requires corroborating MNF or field inspection');

    // Double-counting guard
    expect(() =>
      calculateWaterBalance({
        dmaId: 'DMA-YASAMAL-04',
        dmaName: 'Yasamal',
        windowStart: start,
        windowEnd: end,
        inletContributions: [
          { meterId: 'M1', meterName: 'Inlet', role: 'INLET', volumeM3: 50, averageFlowM3h: 200, coverageRatio: 1 },
        ],
        outletContributions: [],
        consumerContributions: [
          { meterId: 'C1', meterName: 'Consumer', role: 'CONSUMER', volumeM3: 15, averageFlowM3h: 60, coverageRatio: 1 },
        ],
        authorizedBilledConsumptionM3: 15,
      })
    ).toThrow(/double-count/i);
  });
});
