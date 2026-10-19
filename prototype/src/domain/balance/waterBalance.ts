/**
 * Water Balance Domain Calculations (Lecture 1: SPEC ∧ ASM ⇒ REQ & IWA Standard)
 * Computes boundary mass balance across DMAs, preserving signed residuals,
 * uncertainty bounds, and explicit authorized consumption / storage assumptions.
 */

export interface MeterBalanceContribution {
  meterId: string;
  meterName: string;
  role: 'INLET' | 'OUTLET' | 'CONSUMER';
  volumeM3: number;
  averageFlowM3h: number;
  coverageRatio: number;
}

export interface WaterBalanceInputs {
  dmaId: string;
  dmaName: string;
  windowStart: Date;
  windowEnd: Date;
  inletContributions: MeterBalanceContribution[];
  outletContributions: MeterBalanceContribution[];
  authorizedBilledConsumptionM3?: number;
  authorizedUnbilledConsumptionM3?: number;
  storageChangeM3?: number; // ΔV_storage (positive = storage refilled, negative = storage drained)
}

export interface WaterBalanceResult {
  dmaId: string;
  totalInflowM3: number;
  totalOutflowM3: number;
  netBoundaryFlowM3: number; // Inflow - Outflow
  authorizedConsumptionM3: number;
  storageChangeM3: number;
  signedResidualM3: number; // Inflow - Outflow - Authorized - ΔStorage (preserved signed!)
  nrwFractionEstimate: number; // Residual / Inflow
  overallCoverageRatio: number;
  uncertaintyM3: number;
  status: 'NOMINAL' | 'ELEVATED_LOSS' | 'CRITICAL_LEAK' | 'INSUFFICIENT_DATA';
  assumptions: string[];
}

export function calculateWaterBalance(inputs: WaterBalanceInputs): WaterBalanceResult {
  const totalInflowM3 = inputs.inletContributions.reduce((acc, m) => acc + m.volumeM3, 0);
  const totalOutflowM3 = inputs.outletContributions.reduce((acc, m) => acc + m.volumeM3, 0);
  const netBoundaryFlowM3 = totalInflowM3 - totalOutflowM3;

  const authBilled = inputs.authorizedBilledConsumptionM3 ?? 0;
  const authUnbilled = inputs.authorizedUnbilledConsumptionM3 ?? 0;
  const authorizedConsumptionM3 = authBilled + authUnbilled;

  const storageChangeM3 = inputs.storageChangeM3 ?? 0;

  // Signed residual preserves physical truth:
  // A negative residual indicates unmetered inflow, reverse boundary flow, or meter under-registration.
  const signedResidualM3 = netBoundaryFlowM3 - authorizedConsumptionM3 - storageChangeM3;

  // Overall coverage across all boundary meters
  const allMeters = [...inputs.inletContributions, ...inputs.outletContributions];
  const overallCoverageRatio = allMeters.length > 0
    ? allMeters.reduce((acc, m) => acc + m.coverageRatio, 0) / allMeters.length
    : 0;

  const nrwFractionEstimate = totalInflowM3 > 0 
    ? Math.max(0, signedResidualM3 / totalInflowM3)
    : 0;

  // Uncertainty factor: higher if coverage is low or storage change is unverified
  const uncertaintyM3 = Math.abs(signedResidualM3) * (1.0 - overallCoverageRatio * 0.9) + 2.0;

  let status: WaterBalanceResult['status'] = 'NOMINAL';
  if (overallCoverageRatio < 0.70) {
    status = 'INSUFFICIENT_DATA';
  } else if (nrwFractionEstimate > 0.30 || signedResidualM3 > 50) {
    status = 'CRITICAL_LEAK';
  } else if (nrwFractionEstimate > 0.18 || signedResidualM3 > 20) {
    status = 'ELEVATED_LOSS';
  }

  const assumptions: string[] = [
    `Authorized consumption basis: ${authorizedConsumptionM3.toFixed(1)} m³ (billed + unbilled allowance)`,
    `Storage pack delta assumed: ${storageChangeM3.toFixed(1)} m³`,
    'Raw residual is signed; negative values indicate boundary or meter uncertainty, not negative leakage',
    `Overall temporal coverage: ${(overallCoverageRatio * 100).toFixed(1)}% across ${allMeters.length} boundary meters`,
  ];

  return {
    dmaId: inputs.dmaId,
    totalInflowM3: parseFloat(totalInflowM3.toFixed(2)),
    totalOutflowM3: parseFloat(totalOutflowM3.toFixed(2)),
    netBoundaryFlowM3: parseFloat(netBoundaryFlowM3.toFixed(2)),
    authorizedConsumptionM3: parseFloat(authorizedConsumptionM3.toFixed(2)),
    storageChangeM3: parseFloat(storageChangeM3.toFixed(2)),
    signedResidualM3: parseFloat(signedResidualM3.toFixed(2)),
    nrwFractionEstimate: parseFloat(nrwFractionEstimate.toFixed(4)),
    overallCoverageRatio: parseFloat(overallCoverageRatio.toFixed(3)),
    uncertaintyM3: parseFloat(uncertaintyM3.toFixed(2)),
    status,
    assumptions,
  };
}
