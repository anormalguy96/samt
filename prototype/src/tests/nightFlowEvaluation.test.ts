import { describe, it, expect } from 'vitest';
import {
  isInsideNightWindow,
  evaluateMinimumNightFlow,
  getLocalDateKey,
  getNightWindowBoundsUtc,
  DEFAULT_BAKU_NIGHT_WINDOW,
  OPERATIONAL_BAKU_NIGHT_WINDOW,
} from '../domain/nightflow/nightWindowFilter';
import { FixedClock } from '../domain/ports/Clock';
import type { FlowSample } from '../domain/balance/flowIntegration';

describe('Nocturnal MNF Analytics & Asia/Baku Time Boundaries (Lectures 1 & 5)', () => {
  it('classifies timestamps strictly within [02:00, 04:00) Asia/Baku across UTC midnight', () => {
    expect(isInsideNightWindow(new Date('2026-10-19T21:59:59Z'))).toBe(false); // 01:59:59 AZT
    expect(isInsideNightWindow(new Date('2026-10-19T22:00:00Z'))).toBe(true);  // 02:00:00 AZT
    expect(isInsideNightWindow(new Date('2026-10-19T23:00:00Z'))).toBe(true);  // 03:00:00 AZT
    expect(isInsideNightWindow(new Date('2026-10-19T23:59:59Z'))).toBe(true);  // 03:59:59 AZT
    expect(isInsideNightWindow(new Date('2026-10-20T00:00:00Z'))).toBe(false); // 04:00:00 AZT
    expect(isInsideNightWindow(new Date('2026-10-20T10:00:00Z'))).toBe(false); // 14:00:00 AZT

    // Calendar date conversion around UTC/AZT midnight boundary
    expect(getLocalDateKey(new Date('2026-10-19T19:59:59Z'))).toBe('2026-10-19'); // 23:59:59 AZT
    expect(getLocalDateKey(new Date('2026-10-19T20:00:00Z'))).toBe('2026-10-20'); // 00:00:00 AZT
    const bounds = getNightWindowBoundsUtc('2026-10-20');
    expect(bounds.windowStart.toISOString()).toBe('2026-10-19T22:00:00.000Z');
    expect(bounds.windowEnd.toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });

  it('requires minimum coverage and sample count under OPERATIONAL_BAKU_NIGHT_WINDOW', () => {
    const start = new Date('2026-10-19T22:00:00Z');
    const sparse: FlowSample[] = [
      { timestamp: start, flowM3h: 95 },
      { timestamp: new Date(start.getTime() + 60 * 1000), flowM3h: 95 },
    ];
    const evalSparse = evaluateMinimumNightFlow(sparse, 25.0, OPERATIONAL_BAKU_NIGHT_WINDOW);
    expect(evalSparse.status).toBe('INSUFFICIENT_COVERAGE');
    expect(evalSparse.isAnomalyDetected).toBe(false);
  });

  it('detects nocturnal flow spike and reports explicit anomaly threshold and methodology note', () => {
    const clock = new FixedClock('2026-10-19T22:00:00Z'); // 02:00 AZT
    const samples: FlowSample[] = [];
    for (let i = 0; i < 16; i++) {
      samples.push({
        timestamp: new Date(clock.now().getTime() + i * 7 * 60 * 1000), // Spans 105 min (>50% of 120 min)
        flowM3h: 68.2 + (i % 3) * 0.4,
      });
    }

    const evaluation = evaluateMinimumNightFlow(samples, 25.0, OPERATIONAL_BAKU_NIGHT_WINDOW);
    expect(evaluation.status).toBe('ANOMALY_DETECTED');
    expect(evaluation.isAnomalyDetected).toBe(true);
    expect(evaluation.anomalyThresholdM3h).toBe(12);
    expect(evaluation.excessNightFlowM3h).toBeGreaterThan(35);
    expect(evaluation.methodologyNote).toContain('does not by itself prove');
  });

  it('reports nominal state when night flow stays within baseline envelope', () => {
    const start = new Date('2026-10-19T22:00:00Z');
    const samples: FlowSample[] = Array.from({ length: 15 }, (_, i) => ({
      timestamp: new Date(start.getTime() + i * 7 * 60 * 1000),
      flowM3h: 29.5 + (i % 2) * 1.5,
    }));

    const evaluation = evaluateMinimumNightFlow(samples, 30.0, DEFAULT_BAKU_NIGHT_WINDOW);
    expect(evaluation.status).toBe('NOMINAL');
    expect(evaluation.isAnomalyDetected).toBe(false);
  });
});
