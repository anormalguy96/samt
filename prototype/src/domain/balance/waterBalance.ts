/**
 * Water Balance Domain Calculations (Lecture 1: SPEC ∧ ASM ⇒ REQ & IWA Balance Framing)
 * Computes per-meter summed boundary mass balance across DMAs.
 *
 * Sign Conventions & Evidence Boundaries (SAMT v1.1.0):
 * - Net Boundary Flow = sum(Inlet Volumes) - sum(Outlet Volumes).
 * - Storage Delta (storageChangeM3): POSITIVE (+) means water accumulated/refilled inside
 *   DMA storage tanks during the window; NEGATIVE (-) means storage drained into the DMA.
 * - Signed Unexplained Residual = Net Boundary Flow - Authorized Consumption - storageChangeM3.
 *   Negative residuals are preserved signed (indicating unmetered inflow, reverse flow,
 *   storage drawdown, or meter under-registration).
 * - Authorized Consumption Double-Count Guard: If metered CONSUMER contributions are supplied,
 *   authorizedBilledConsumptionM3 must NOT also include those same metered volumes; pass either
 *   metered consumerContributions OR an explicit unmetered/allowance breakdown.
 * - Evidence Qualification: A positive boundary residual alone is NOT classified as confirmed
 *   NRW or a confirmed physical leak without corroborating MNF or field verification evidence.
 */

export interface MeterBalanceContribution {
  meterId: string;
  meterName: string;
  role: 'INLET' | 'OUTLET' | 'CONSUMER';
  volumeM3: number;
  measuredVolumeM3?: number;
  estimatedBoundaryVolumeM3?: number;
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
  consumerContributions?: MeterBalanceContribution[];
  authorizedBilledConsumptionM3?: number;
  authorizedUnbilledConsumptionM3?: number;
  storageChangeM3?: number; // + = storage refilled inside DMA, - = storage drained into DMA
}

export type WaterBalanceStatus =
  | 'NOMINAL'
  | 'ELEVATED_LOSS'
  | 'CRITICAL_LEAK'
  | 'INSUFFICIENT_DATA';

export interface WaterBalanceResult {
  dmaId: string;
  windowStart: Date;
  windowEnd: Date;
  totalInflowM3: number;
  totalOutflowM3: number;
  measuredInflowM3: number;
  measuredOutflowM3: number;
  netBoundaryFlowM3: number;
  meteredConsumerConsumptionM3: number;
  authorizedConsumptionM3: number;
  storageChangeM3: number;
  signedResidualM3: number;
  unexplainedResidualFraction: number; // Signed residual / totalInflowM3 (0 if inflow == 0)
  /** @deprecated Alias retained for backward compatibility; represents clamped unexplained residual fraction, not confirmed NRW */
  nrwFractionEstimate: number;
  overallCoverageRatio: number;
  uncertaintyM3: number;
  status: WaterBalanceStatus;
  evidenceQualification: string;
  assumptions: string[];
}

export function calculateWaterBalance(inputs: WaterBalanceInputs): WaterBalanceResult {
  if (
    inputs.consumerContributions &&
    inputs.consumerContributions.length > 0 &&
    inputs.authorizedBilledConsumptionM3 !== undefined &&
    inputs.authorizedBilledConsumptionM3 > 0
  ) {
    throw new Error(
      'Authorized consumption double-count guard: do not supply both metered consumerContributions and flat authorizedBilledConsumptionM3 simultaneously'
    );
  }

  for (const m of [
    ...inputs.inletContributions,
    ...inputs.outletContributions,
    ...(inputs.consumerContributions ?? []),
  ]) {
    if (!Number.isFinite(m.volumeM3) || m.volumeM3 < 0) {
      throw new Error(`Invalid meter volume for ${m.meterId}: ${m.volumeM3}`);
    }
    if (!Number.isFinite(m.coverageRatio) || m.coverageRatio < 0 || m.coverageRatio > 1) {
      throw new Error(`Invalid coverageRatio for ${m.meterId}: ${m.coverageRatio}`);
    }
  }

  const totalInflowM3 = inputs.inletContributions.reduce((acc, m) => acc + m.volumeM3, 0);
  const totalOutflowM3 = inputs.outletContributions.reduce((acc, m) => acc + m.volumeM3, 0);
  const measuredInflowM3 = inputs.inletContributions.reduce(
    (acc, m) => acc + (m.measuredVolumeM3 ?? m.volumeM3),
    0
  );
  const measuredOutflowM3 = inputs.outletContributions.reduce(
    (acc, m) => acc + (m.measuredVolumeM3 ?? m.volumeM3),
    0
  );
  const netBoundaryFlowM3 = totalInflowM3 - totalOutflowM3;

  const meteredConsumerConsumptionM3 = (inputs.consumerContributions ?? []).reduce(
    (acc, m) => acc + m.volumeM3,
    0
  );
  const authBilled = inputs.authorizedBilledConsumptionM3 ?? 0;
  const authUnbilled = inputs.authorizedUnbilledConsumptionM3 ?? 0;

  if (!Number.isFinite(authBilled) || authBilled < 0) {
    throw new Error(`authorizedBilledConsumptionM3 must be finite and >= 0`);
  }
  if (!Number.isFinite(authUnbilled) || authUnbilled < 0) {
    throw new Error(`authorizedUnbilledConsumptionM3 must be finite and >= 0`);
  }

  const authorizedConsumptionM3 = meteredConsumerConsumptionM3 + authBilled + authUnbilled;

  const storageChangeM3 = inputs.storageChangeM3 ?? 0;
  if (!Number.isFinite(storageChangeM3)) {
    throw new Error(`storageChangeM3 must be finite`);
  }

  // Signed unexplained residual: positive = unexplained outflow/loss candidate; negative = unmetered inflow/meter bias
  const signedResidualM3 = netBoundaryFlowM3 - authorizedConsumptionM3 - storageChangeM3;

  const boundaryMeters = [...inputs.inletContributions, ...inputs.outletContributions];
  const overallCoverageRatio =
    boundaryMeters.length > 0
      ? boundaryMeters.reduce((acc, m) => acc + m.coverageRatio, 0) / boundaryMeters.length
      : 0;

  const unexplainedResidualFraction = totalInflowM3 > 0 ? signedResidualM3 / totalInflowM3 : 0;
  const nrwFractionEstimate = Math.max(0, unexplainedResidualFraction);

  const uncertaintyM3 =
    Math.abs(signedResidualM3) * (1.0 - overallCoverageRatio * 0.9) +
    (boundaryMeters.length > 0 ? 2.0 : 0.0);

  let status: WaterBalanceStatus = 'NOMINAL';
  if (boundaryMeters.length === 0 || overallCoverageRatio < 0.7) {
    status = 'INSUFFICIENT_DATA';
  } else if (nrwFractionEstimate > 0.3 || signedResidualM3 > 50) {
    status = 'CRITICAL_LEAK';
  } else if (nrwFractionEstimate > 0.18 || signedResidualM3 > 20) {
    status = 'ELEVATED_LOSS';
  }

  const evidenceQualification =
    status === 'INSUFFICIENT_DATA'
      ? 'Insufficient boundary meter temporal coverage (< 70%); balance is inconclusive.'
      : 'Unexplained boundary residual computed from synthetic per-meter flow integration; requires corroborating MNF or field inspection before classifying as confirmed NRW or physical leakage.';

  const assumptions: string[] = [
    `Authorized consumption basis: ${authorizedConsumptionM3.toFixed(2)} m³ (metered=${meteredConsumerConsumptionM3.toFixed(2)}, billed_allowance=${authBilled.toFixed(2)}, unbilled_allowance=${authUnbilled.toFixed(2)})`,
    `Storage delta sign convention: ${storageChangeM3.toFixed(2)} m³ (+ means tank refill inside DMA; - means tank drawdown)`,
    'Signed unexplained residual is preserved without clamping; negative values indicate unmetered inflow, storage drawdown, or meter error',
    `Boundary meter coverage: ${(overallCoverageRatio * 100).toFixed(1)}% across ${boundaryMeters.length} boundary meter(s)`,
  ];

  return {
    dmaId: inputs.dmaId,
    windowStart: new Date(inputs.windowStart.getTime()),
    windowEnd: new Date(inputs.windowEnd.getTime()),
    totalInflowM3: parseFloat(totalInflowM3.toFixed(4)),
    totalOutflowM3: parseFloat(totalOutflowM3.toFixed(4)),
    measuredInflowM3: parseFloat(measuredInflowM3.toFixed(4)),
    measuredOutflowM3: parseFloat(measuredOutflowM3.toFixed(4)),
    netBoundaryFlowM3: parseFloat(netBoundaryFlowM3.toFixed(4)),
    meteredConsumerConsumptionM3: parseFloat(meteredConsumerConsumptionM3.toFixed(4)),
    authorizedConsumptionM3: parseFloat(authorizedConsumptionM3.toFixed(4)),
    storageChangeM3: parseFloat(storageChangeM3.toFixed(4)),
    signedResidualM3: parseFloat(signedResidualM3.toFixed(4)),
    unexplainedResidualFraction: parseFloat(unexplainedResidualFraction.toFixed(4)),
    nrwFractionEstimate: parseFloat(nrwFractionEstimate.toFixed(4)),
    overallCoverageRatio: parseFloat(overallCoverageRatio.toFixed(4)),
    uncertaintyM3: parseFloat(uncertaintyM3.toFixed(4)),
    status,
    evidenceQualification,
    assumptions,
  };
}
