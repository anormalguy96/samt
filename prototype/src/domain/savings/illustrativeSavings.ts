/**
 * Illustrative Water Savings Estimator (Lecture 1: GCE & Lecture 2: Quality Attributes)
 * Models pressure-normalized leakage differences using Torricelli / FAVAD scaling:
 *
 *   Q_base_normalized = Q_baseline * (P_post / P_baseline)^alpha
 *   Delta_Q_hourly    = Q_base_normalized - Q_post
 *
 * SAMT v1.1.0 Hardening:
 * - Preserves the pressure-only regression: 100 m³/h @ 4.0 bar vs 50 m³/h @ 1.0 bar
 *   with alpha = 0.5 yields exactly 0.0 m³/h modeled savings.
 * - Preserves signed negative results without clamping to zero.
 * - Validates all numeric inputs strictly (rejects negative flow, non-positive pressure,
 *   non-finite values, alpha outside [0.5, 1.5], negative tariff, non-positive horizon).
 * - Explicitly labeled as illustrative modeled estimates — NOT field-measured savings
 *   or formal IPMVP Option B compliance.
 */

export interface SavingsInputs {
  baselineFlowM3h: number;
  baselinePressureBar: number;
  postRepairFlowM3h: number;
  postRepairPressureBar: number;
  leakageExponent?: number; // alpha in [0.5, 1.5]
  illustrativeTariffAznM3?: number;
  timeHorizonDays?: number;
}

export class SavingsValidationError extends Error {
  readonly code = 'SAVINGS_INVALID_INPUT';
  constructor(message: string) {
    super(message);
    this.name = 'SavingsValidationError';
  }
}

export interface SavingsResult {
  baselineFlowM3h: number;
  baselinePressureBar: number;
  postRepairFlowM3h: number;
  postRepairPressureBar: number;
  leakageExponent: number;
  normalizedBaselineFlowM3h: number;
  rawFlowDifferenceM3h: number;
  pressureAdjustedHourlySavingsM3h: number; // Signed; negative values preserved
  dailySavingsM3: number;
  projectedAnnualSavingsM3: number;
  dailyEconomicValueAzn: number;
  projectedAnnualEconomicValueAzn: number;
  illustrativeTariffAznM3: number;
  timeHorizonDays: number;
  isModeledReductionPositive: boolean;
  /** @deprecated Alias retained for backward compatibility; indicates modeled reduction > 1.0 m³/h, NOT field-measured IPMVP verification */
  isLeakReductionVerified: boolean;
  uncertaintyMarginPct: number;
  modelQualification: string;
  disclaimers: string[];
}

export function estimateIllustrativeSavings(inputs: SavingsInputs): SavingsResult {
  if (!Number.isFinite(inputs.baselineFlowM3h) || inputs.baselineFlowM3h < 0) {
    throw new SavingsValidationError(`baselineFlowM3h must be finite and >= 0 (received ${inputs.baselineFlowM3h})`);
  }
  if (!Number.isFinite(inputs.postRepairFlowM3h) || inputs.postRepairFlowM3h < 0) {
    throw new SavingsValidationError(`postRepairFlowM3h must be finite and >= 0 (received ${inputs.postRepairFlowM3h})`);
  }
  if (!Number.isFinite(inputs.baselinePressureBar) || inputs.baselinePressureBar <= 0) {
    throw new SavingsValidationError(`baselinePressureBar must be finite and > 0 (received ${inputs.baselinePressureBar})`);
  }
  if (!Number.isFinite(inputs.postRepairPressureBar) || inputs.postRepairPressureBar <= 0) {
    throw new SavingsValidationError(`postRepairPressureBar must be finite and > 0 (received ${inputs.postRepairPressureBar})`);
  }

  const alpha = inputs.leakageExponent ?? 0.5;
  if (!Number.isFinite(alpha) || alpha < 0.5 || alpha > 1.5) {
    throw new SavingsValidationError(`leakageExponent (alpha) must lie within [0.5, 1.5] (received ${alpha})`);
  }

  const tariff = inputs.illustrativeTariffAznM3 ?? 0.4;
  if (!Number.isFinite(tariff) || tariff < 0) {
    throw new SavingsValidationError(`illustrativeTariffAznM3 must be finite and >= 0 (received ${tariff})`);
  }

  const days = inputs.timeHorizonDays ?? 365;
  if (!Number.isFinite(days) || days <= 0) {
    throw new SavingsValidationError(`timeHorizonDays must be finite and > 0 (received ${days})`);
  }

  const qBase = inputs.baselineFlowM3h;
  const pBase = inputs.baselinePressureBar;
  const qPost = inputs.postRepairFlowM3h;
  const pPost = inputs.postRepairPressureBar;

  const pressureRatio = pPost / pBase;
  const pressureFactor = Math.pow(pressureRatio, alpha);
  const normalizedBaselineFlowM3h = qBase * pressureFactor;

  const rawFlowDifferenceM3h = qBase - qPost;
  const pressureAdjustedHourlySavingsM3h = normalizedBaselineFlowM3h - qPost;

  const dailySavingsM3 = pressureAdjustedHourlySavingsM3h * 24;
  const projectedAnnualSavingsM3 = dailySavingsM3 * days;

  const dailyEconomicValueAzn = dailySavingsM3 * tariff;
  const projectedAnnualEconomicValueAzn = projectedAnnualSavingsM3 * tariff;

  const isModeledReductionPositive = pressureAdjustedHourlySavingsM3h > 1.0;
  const uncertaintyMarginPct = Math.min(35, 5 + Math.abs(pBase - pPost) * 4);

  const modelQualification =
    'Illustrative pressure-normalized leakage model (NOT field-measured water savings and NOT formal IPMVP compliance).';

  const disclaimers: string[] = [
    `Baseline leakage flow assumed wholly pressure-responsive and normalized from ${pBase.toFixed(2)} bar to ${pPost.toFixed(2)} bar with α = ${alpha.toFixed(2)}`,
    'Signed negative values are preserved when post-repair flow exceeds pressure-normalized baseline',
    `Tariff rate (${tariff.toFixed(2)} AZN/m³) is an illustrative valuation input, not an authoritative utility financial tariff`,
    `Horizon projection assumes steady flow over ${days} days and is not IPMVP-certified field measurement`,
  ];

  return {
    baselineFlowM3h: parseFloat(qBase.toFixed(2)),
    baselinePressureBar: parseFloat(pBase.toFixed(2)),
    postRepairFlowM3h: parseFloat(qPost.toFixed(2)),
    postRepairPressureBar: parseFloat(pPost.toFixed(2)),
    leakageExponent: parseFloat(alpha.toFixed(2)),
    normalizedBaselineFlowM3h: parseFloat(normalizedBaselineFlowM3h.toFixed(2)),
    rawFlowDifferenceM3h: parseFloat(rawFlowDifferenceM3h.toFixed(2)),
    pressureAdjustedHourlySavingsM3h: parseFloat(pressureAdjustedHourlySavingsM3h.toFixed(2)),
    dailySavingsM3: parseFloat(dailySavingsM3.toFixed(1)),
    projectedAnnualSavingsM3: parseFloat(projectedAnnualSavingsM3.toFixed(0)),
    dailyEconomicValueAzn: parseFloat(dailyEconomicValueAzn.toFixed(2)),
    projectedAnnualEconomicValueAzn: parseFloat(projectedAnnualEconomicValueAzn.toFixed(2)),
    illustrativeTariffAznM3: parseFloat(tariff.toFixed(2)),
    timeHorizonDays: days,
    isModeledReductionPositive,
    isLeakReductionVerified: isModeledReductionPositive,
    uncertaintyMarginPct: parseFloat(uncertaintyMarginPct.toFixed(1)),
    modelQualification,
    disclaimers,
  };
}
