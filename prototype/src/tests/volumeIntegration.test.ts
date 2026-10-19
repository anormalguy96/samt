import { describe, it, expect } from 'vitest';
import { integrateFlowVolume, type FlowSample } from '../domain/balance/flowIntegration';

describe('Trapezoidal Flow Volume Integration (Regression & Correctness)', () => {
  it('corrects the 1,500 m³ regression: 60 fifteen-second samples of constant 100 m³/h yields exactly 25 m³', () => {
    const windowStart = new Date('2026-10-20T03:00:00Z');
    const windowEnd = new Date('2026-10-20T03:15:00Z'); // 15 minutes = 0.25 hours

    // Generate 60 samples, one every 15 seconds: t = 0s, 15s, 30s, ..., 885s
    const samples: FlowSample[] = [];
    for (let i = 0; i < 60; i++) {
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

    // Old bug: SUM(value * 0.25) across 60 samples returned 60 * 25 = 1,500 m³!
    // True physical volume: 100 m³/h * 0.25 h = 25.0 m³
    expect(result.totalVolumeM3).toBeCloseTo(25.0, 1);
    expect(result.averageFlowM3h).toBeCloseTo(100.0, 1);
    expect(result.effectiveDurationHours).toBeCloseTo(0.25, 2);
    expect(result.isCompleteCoverage).toBe(true);
    expect(result.coverageRatio).toBeGreaterThanOrEqual(0.95);
  });

  it('correctly integrates irregular sample intervals with varying flow rates', () => {
    // 0 min: 60 m³/h, 5 min: 120 m³/h, 15 min: 120 m³/h
    // Trapezoid 1: 0 to 5 min (5/60 h = 1/12 h), avg flow = (60 + 120)/2 = 90 -> 90 * (1/12) = 7.5 m³
    // Trapezoid 2: 5 to 15 min (10/60 h = 1/6 h), avg flow = (120 + 120)/2 = 120 -> 120 * (1/6) = 20.0 m³
    // Total = 7.5 + 20.0 = 27.5 m³
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

  it('detects large gaps and reports degraded coverage and increased uncertainty', () => {
    const start = new Date('2026-10-20T02:00:00Z');
    const end = new Date('2026-10-20T03:00:00Z'); // 1 hour window

    // Only 2 samples separated by 5 minutes at the beginning, followed by 55 min of missing data
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
    expect(result.maxGapSeconds).toBeGreaterThan(3000);
    expect(result.uncertaintyEstimateM3).toBeGreaterThan(0);
  });

  it('handles empty sample sets safely', () => {
    const result = integrateFlowVolume([]);
    expect(result.totalVolumeM3).toBe(0);
    expect(result.coverageRatio).toBe(0);
    expect(result.isCompleteCoverage).toBe(false);
  });
});
