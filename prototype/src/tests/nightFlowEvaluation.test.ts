import { describe, it, expect } from 'vitest';
import { 
  isInsideNightWindow, 
  evaluateMinimumNightFlow,
  DEFAULT_BAKU_NIGHT_WINDOW 
} from '../domain/nightflow/nightWindowFilter';
import { FixedClock } from '../domain/ports/Clock';
import type { FlowSample } from '../domain/balance/flowIntegration';

describe('Nocturnal MNF Analytics & Night Window Seam (Lectures 1 & 5)', () => {
  it('correctly classifies timestamps within the [02:00, 04:00) Asia/Baku window', () => {
    // Asia/Baku is UTC+4.
    // 02:00 AZT is 22:00 UTC previous day
    // 03:00 AZT is 23:00 UTC previous day
    // 03:59 AZT is 23:59 UTC previous day
    // 04:00 AZT is 00:00 UTC same day (outside window)
    const t0159 = new Date('2026-10-19T21:59:00Z'); // 01:59 AZT -> false
    const t0200 = new Date('2026-10-19T22:00:00Z'); // 02:00 AZT -> true
    const t0300 = new Date('2026-10-19T23:00:00Z'); // 03:00 AZT -> true
    const t0359 = new Date('2026-10-19T23:59:59Z'); // 03:59:59 AZT -> true
    const t0400 = new Date('2026-10-20T00:00:00Z'); // 04:00 AZT -> false
    const t1400 = new Date('2026-10-20T10:00:00Z'); // 14:00 AZT -> false

    expect(isInsideNightWindow(t0159)).toBe(false);
    expect(isInsideNightWindow(t0200)).toBe(true);
    expect(isInsideNightWindow(t0300)).toBe(true);
    expect(isInsideNightWindow(t0359)).toBe(true);
    expect(isInsideNightWindow(t0400)).toBe(false);
    expect(isInsideNightWindow(t0159, DEFAULT_BAKU_NIGHT_WINDOW)).toBe(false);
    expect(isInsideNightWindow(t1400)).toBe(false);
  });

  it('detects abnormal leak spike in nocturnal flow during fixed 03:00 AM clock simulation', () => {
    // Testability Demonstration (Lecture 5):
    // Using FixedClock to jump directly to 03:00 AZT in CI during daytime
    const clock = new FixedClock('2026-10-19T23:00:00Z'); // 03:00 AZT
    const baselineMnf = 25.0; // Historical dry-weather baseline is 25 m³/h

    // Injected nocturnal burst: flow spikes to ~68 m³/h (excess +43 m³/h)
    const samples: FlowSample[] = [];
    const baseMs = clock.now().getTime();
    for (let i = 0; i < 20; i++) {
      samples.push({
        timestamp: new Date(baseMs + i * 60 * 1000), // Within 03:00 - 03:20 AZT
        flowM3h: 68.2 + (i % 3) * 0.4,
      });
    }

    const evaluation = evaluateMinimumNightFlow(samples, baselineMnf);

    expect(evaluation.isWithinNightWindow).toBe(true);
    expect(evaluation.sampleCount).toBe(20);
    expect(evaluation.isAnomalyDetected).toBe(true);
    expect(evaluation.excessNightFlowM3h).toBeGreaterThan(35.0);
    expect(evaluation.detectionReason).toContain('exceeds baseline');
  });

  it('reports nominal state when night flow stays within baseline envelope', () => {
    const clock = new FixedClock('2026-10-19T23:00:00Z'); // 03:00 AZT
    const baselineMnf = 30.0;

    // Nominal nocturnal flow between 28 and 33 m³/h
    const samples: FlowSample[] = [];
    const baseMs = clock.now().getTime();
    for (let i = 0; i < 15; i++) {
      samples.push({
        timestamp: new Date(baseMs + i * 60 * 1000),
        flowM3h: 29.5 + (i % 2) * 1.5,
      });
    }

    const evaluation = evaluateMinimumNightFlow(samples, baselineMnf);

    expect(evaluation.isWithinNightWindow).toBe(true);
    expect(evaluation.isAnomalyDetected).toBe(false);
    expect(evaluation.excessNightFlowM3h).toBeLessThan(12.0);
    expect(evaluation.detectionReason).toContain('Nominal');
  });
});
