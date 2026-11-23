import { describe, it, expect } from 'vitest';
import {
  estimateIllustrativeSavings,
  SavingsValidationError,
} from '../domain/savings/illustrativeSavings';

describe('Illustrative Water Savings Estimator (Torricelli Pressure Normalization)', () => {
  it('preserves pressure-only regression: 100 m³/h @ 4 bar vs 50 m³/h @ 1 bar with alpha=0.5 yields 0.0 m³/h', () => {
    const result = estimateIllustrativeSavings({
      baselineFlowM3h: 100.0,
      baselinePressureBar: 4.0,
      postRepairFlowM3h: 50.0,
      postRepairPressureBar: 1.0,
      leakageExponent: 0.5,
    });

    expect(result.normalizedBaselineFlowM3h).toBeCloseTo(50.0, 2);
    expect(result.rawFlowDifferenceM3h).toBeCloseTo(50.0, 2);
    expect(result.pressureAdjustedHourlySavingsM3h).toBeCloseTo(0.0, 2);
    expect(result.dailySavingsM3).toBeCloseTo(0.0, 1);
    expect(result.isModeledReductionPositive).toBe(false);
    expect(result.modelQualification).toContain('NOT formal IPMVP compliance');
  });

  it('computes modeled reduction when post-repair flow drops beyond pressure scaling', () => {
    const result = estimateIllustrativeSavings({
      baselineFlowM3h: 120.0,
      baselinePressureBar: 4.0,
      postRepairFlowM3h: 40.0,
      postRepairPressureBar: 4.0,
      leakageExponent: 0.5,
      illustrativeTariffAznM3: 0.4,
    });

    expect(result.pressureAdjustedHourlySavingsM3h).toBeCloseTo(80.0, 2);
    expect(result.dailySavingsM3).toBeCloseTo(1920, 1);
    expect(result.dailyEconomicValueAzn).toBeCloseTo(768.0, 2);
    expect(result.isModeledReductionPositive).toBe(true);
  });

  it('preserves signed negative savings when post-repair flow worsens', () => {
    const result = estimateIllustrativeSavings({
      baselineFlowM3h: 100.0,
      baselinePressureBar: 3.5,
      postRepairFlowM3h: 140.0,
      postRepairPressureBar: 3.5,
    });

    expect(result.pressureAdjustedHourlySavingsM3h).toBeCloseTo(-40.0, 2);
    expect(result.dailySavingsM3).toBeLessThan(0);
    expect(result.isModeledReductionPositive).toBe(false);
  });

  it('rejects invalid non-positive pressure, negative flow, non-finite inputs, or out-of-range alpha', () => {
    expect(() =>
      estimateIllustrativeSavings({
        baselineFlowM3h: -5,
        baselinePressureBar: 4.0,
        postRepairFlowM3h: 20,
        postRepairPressureBar: 4.0,
      })
    ).toThrow(SavingsValidationError);

    expect(() =>
      estimateIllustrativeSavings({
        baselineFlowM3h: 100,
        baselinePressureBar: 0,
        postRepairFlowM3h: 50,
        postRepairPressureBar: 1.0,
      })
    ).toThrow(SavingsValidationError);

    expect(() =>
      estimateIllustrativeSavings({
        baselineFlowM3h: 100,
        baselinePressureBar: 4.0,
        postRepairFlowM3h: 50,
        postRepairPressureBar: 4.0,
        leakageExponent: 2.0,
      })
    ).toThrow(SavingsValidationError);
  });
});
