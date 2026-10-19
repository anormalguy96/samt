/**
 * Illustrative Water Savings Estimator (Lecture 1: GCE & Lecture 2: Quality Attributes)
 * Evaluates physical leakage reduction by normalizing pre-repair baseline flow
 * to post-repair operating pressure using the Torricelli / FAVAD pressure-leakage relationship:
 * 
 *   Q_base_normalized = Q_baseline * (P_post / P_baseline)^alpha
 *   Delta_Q_hourly    = Q_base_normalized - Q_post
 * 
 * Regressed Counterexample Fixed:
 * Leakage of 100 m³/h at pressure 4.0 bar vs 50 m³/h at pressure 1.0 bar with alpha = 0.5:
 * Q_norm = 100 * (1.0 / 4.0)^0.5 = 100 * 0.5 = 50 m³/h.
 * Adjusted Savings = 50 - 50 = 0.0 m³/h.
 * Preserves visible negative values when post-repair flow increases.
 */

export interface SavingsInputs {
  baselineFlowM3h: number;     // Q_base
  baselinePressureBar: number; // P_base
  postRepairFlowM3h: number;   // Q_post
  postRepairPressureBar: number; // P_post
  leakageExponent?: number;    // alpha (typically 0.5 for orifice, up to 1.5 for flexible cracks)
  illustrativeTariffAznM3?: number; // Configurable illustrative reference tariff
  timeHorizonDays?: number;    // Default: 365 days
}

export interface SavingsResult {
  baselineFlowM3h: number;
  baselinePressureBar: number;
  postRepairFlowM3h: number;
  postRepairPressureBar: number;
  leakageExponent: number;
  normalizedBaselineFlowM3h: number;
  rawFlowDifferenceM3h: number; // Unadjusted: Q_base - Q_post
  pressureAdjustedHourlySavingsM3h: number; // Q_base_norm - Q_post (can be negative!)
  dailySavingsM3: number;
  projectedAnnualSavingsM3: number;
  dailyEconomicValueAzn: number;
  projectedAnnualEconomicValueAzn: number;
  illustrativeTariffAznM3: number;
  isLeakReductionVerified: boolean;
  uncertaintyMarginPct: number;
  disclaimers: string[];
}

export function estimateIllustrativeSavings(inputs: SavingsInputs): SavingsResult {
  const qBase = Math.max(0, Number.isFinite(inputs.baselineFlowM3h) ? inputs.baselineFlowM3h : 0);
  const pBase = Math.max(0.1, Number.isFinite(inputs.baselinePressureBar) ? inputs.baselinePressureBar : 1.0);
  const qPost = Math.max(0, Number.isFinite(inputs.postRepairFlowM3h) ? inputs.postRepairFlowM3h : 0);
  const pPost = Math.max(0.1, Number.isFinite(inputs.postRepairPressureBar) ? inputs.postRepairPressureBar : 1.0);

  const alpha = inputs.leakageExponent ?? 0.5;
  const tariff = inputs.illustrativeTariffAznM3 ?? 0.40;
  const days = inputs.timeHorizonDays ?? 365;

  // 1. Torricelli / FAVAD pressure adjustment of baseline
  // Normalizing baseline to post-repair pressure condition
  const pressureRatio = pPost / pBase;
  const pressureFactor = Math.pow(pressureRatio, alpha);
  const normalizedBaselineFlowM3h = qBase * pressureFactor;

  // 2. Savings computation (preserved signed!)
  const rawFlowDifferenceM3h = qBase - qPost;
  const pressureAdjustedHourlySavingsM3h = normalizedBaselineFlowM3h - qPost;

  const dailySavingsM3 = pressureAdjustedHourlySavingsM3h * 24;
  const projectedAnnualSavingsM3 = dailySavingsM3 * days;

  const dailyEconomicValueAzn = dailySavingsM3 * tariff;
  const projectedAnnualEconomicValueAzn = projectedAnnualSavingsM3 * tariff;

  const isLeakReductionVerified = pressureAdjustedHourlySavingsM3h > 1.0;

  // Uncertainty margin: higher if pressure differential is large
  const uncertaintyMarginPct = Math.min(35, 5 + Math.abs(pBase - pPost) * 4);

  const disclaimers: string[] = [
    `Baseline flow normalized from ${pBase.toFixed(1)} bar to ${pPost.toFixed(1)} bar using leakage exponent α = ${alpha.toFixed(2)}`,
    'Negative savings indicate flow increased after repair or pressure drop was the sole reason for flow reduction',
    `Tariff rate of ${tariff.toFixed(2)} AZN/m³ is an illustrative reference value, not an authoritative utility cost`,
    'Annual figures are projections assuming steady operating conditions over a 365-day horizon',
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
    isLeakReductionVerified,
    uncertaintyMarginPct: parseFloat(uncertaintyMarginPct.toFixed(1)),
    disclaimers,
  };
}
