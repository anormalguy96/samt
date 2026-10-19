import { describe, it, expect } from 'vitest';
import { estimateIllustrativeSavings } from '../domain/savings/illustrativeSavings';

describe('Illustrative Water Savings Estimator (Torricelli Pressure Normalization)', () => {
  it('corrects the regression counterexample: leakage 100 @ 4 bar vs 50 @ 1 bar with α=0.5 must yield 0.0 m³/h savings', () => {
    // Counterexample specification:
    // With no repair performed, leakage drops purely due to pressure reduction from 4.0 bar to 1.0 bar.
    // Torricelli pressure correction: Q_base_norm = 100 * (1.0 / 4.0)^0.5 = 100 * 0.5 = 50.0 m³/h.
    // Pressure-adjusted savings: 50.0 - 50.0 = 0.0 m³/h!
    const result = estimateIllustrativeSavings({
      baselineFlowM3h: 100.0,
      baselinePressureBar: 4.0,
      postRepairFlowM3h: 50.0,
      postRepairPressureBar: 1.0,
      leakageExponent: 0.5,
    });

    expect(result.normalizedBaselineFlowM3h).toBeCloseTo(50.0, 2);
    // Unadjusted difference falsely claims 50 m³/h savings:
    expect(result.rawFlowDifferenceM3h).toBeCloseTo(50.0, 2);
    // Correct pressure-adjusted savings reveals ZERO physical savings:
    expect(result.pressureAdjustedHourlySavingsM3h).toBeCloseTo(0.0, 2);
    expect(result.dailySavingsM3).toBeCloseTo(0.0, 1);
    expect(result.isLeakReductionVerified).toBe(false);
  });

  it('demonstrates real physical leak reduction when flow drops beyond pressure scaling', () => {
    // Baseline: 120 m³/h at 4.0 bar
    // Post-repair: 40 m³/h at 4.0 bar (same pressure)
    // Savings: 120 - 40 = 80 m³/h
    const result = estimateIllustrativeSavings({
      baselineFlowM3h: 120.0,
      baselinePressureBar: 4.0,
      postRepairFlowM3h: 40.0,
      postRepairPressureBar: 4.0,
      leakageExponent: 0.5,
      illustrativeTariffAznM3: 0.40,
    });

    expect(result.pressureAdjustedHourlySavingsM3h).toBeCloseTo(80.0, 2);
    expect(result.dailySavingsM3).toBeCloseTo(80 * 24, 1); // 1,920 m³/day
    expect(result.dailyEconomicValueAzn).toBeCloseTo(1920 * 0.40, 2); // 768.00 AZN/day
    expect(result.isLeakReductionVerified).toBe(true);
  });

  it('preserves visible negative savings when flow increases after intervention', () => {
    // If post-repair flow worsened to 140 m³/h
    const result = estimateIllustrativeSavings({
      baselineFlowM3h: 100.0,
      baselinePressureBar: 3.5,
      postRepairFlowM3h: 140.0,
      postRepairPressureBar: 3.5,
    });

    expect(result.pressureAdjustedHourlySavingsM3h).toBeLessThan(0);
    expect(result.pressureAdjustedHourlySavingsM3h).toBeCloseTo(-40.0, 2);
    expect(result.dailySavingsM3).toBeLessThan(0);
    expect(result.isLeakReductionVerified).toBe(false);
  });

  it('includes explicit disclaimers regarding illustrative tariffs and projections', () => {
    const result = estimateIllustrativeSavings({
      baselineFlowM3h: 90,
      baselinePressureBar: 3.5,
      postRepairFlowM3h: 60,
      postRepairPressureBar: 3.5,
    });

    expect(result.disclaimers.some((d) => d.includes('illustrative reference value'))).toBe(true);
    expect(result.disclaimers.some((d) => d.includes('projections'))).toBe(true);
  });
});
