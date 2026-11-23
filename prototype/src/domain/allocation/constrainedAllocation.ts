/**
 * Constrained Water Allocation Domain Policy (Lectures 2, 3, & 13: Value-Sensitive Design)
 * Implements a deterministic progressive-filling heuristic with priority-weighted surplus
 * redistribution (explicitly NOT a Mixed-Integer Linear Programming / MILP optimal solver).
 *
 * SAMT v1.1.0 Hardening:
 * - Preserves the 900 supply / 705 demand regression (705 allocated, 0 unmet, 195 residual, Gini 0.000)
 *   and strict conservation for the 610 supply deficit scenario.
 * - Strict input validation: rejects negative/non-finite supply/demand/capacity/minimums,
 *   invalid weights (<= 0 or > 1), duplicate consumer IDs, and infeasible minimum survival bounds
 *   (minimum > min(demand, capacity) or sum(minimums) > supply under strict mode).
 * - Handles undefined Gini cleanly (returns giniIndex = null when total positive demand is zero).
 * - Declares explicit volumeUnit ('THOUSAND_M3' | 'M3') and deliveryHorizonHours.
 */

export type AllocationVolumeUnit = 'THOUSAND_M3' | 'M3';

export interface ConsumerRequest {
  id: string;
  name: string;
  region: string;
  demandM3: number;
  weight: number; // Priority weight in (0, 1]
  canalCapacityM3: number;
  minimumSurvivalM3?: number;
}

export interface AllocationOptions {
  volumeUnit?: AllocationVolumeUnit;
  deliveryHorizonHours?: number;
  /**
   * 'REJECT' throws AllocationValidationError when sum(minimumSurvivalM3) > supply;
   * 'PRORATE' explicitly prorates survival quotas and marks status = 'MINIMUMS_PRORATED'.
   */
  infeasibleMinimumsPolicy?: 'REJECT' | 'PRORATE';
}

export class AllocationValidationError extends Error {
  readonly code = 'ALLOCATION_INVALID_INPUT';
  constructor(
    message: string,
    public readonly reasonCode:
      | 'INVALID_SUPPLY'
      | 'DUPLICATE_CONSUMER_ID'
      | 'INVALID_CONSUMER_FIELD'
      | 'INVALID_WEIGHT'
      | 'INFEASIBLE_MINIMUMS'
  ) {
    super(message);
    this.name = 'AllocationValidationError';
  }
}

export interface ConsumerAllocationResult {
  id: string;
  name: string;
  region: string;
  demandM3: number;
  weight: number;
  canalCapacityM3: number;
  allocatedM3: number;
  satisfactionPct: number | null; // null when demandM3 === 0
  unmetM3: number;
  reasonCode: string;
}

export interface AllocationPlanResult {
  status: 'FEASIBLE' | 'ZERO_SUPPLY' | 'ZERO_DEMAND' | 'MINIMUMS_PRORATED';
  volumeUnit: AllocationVolumeUnit;
  deliveryHorizonHours: number;
  totalSupplyM3: number;
  totalAllocatedM3: number;
  totalDemandM3: number;
  unmetDemandM3: number;
  residualSupplyM3: number;
  giniIndex: number | null; // null when undefined (zero positive-demand consumers or all-zero allocations with zero sum)
  giniNote: string;
  satisfactionDistribution: (number | null)[];
  allocations: ConsumerAllocationResult[];
  policyDescription: string;
  solveDurationMs: number;
}

/**
 * Calculates Gini coefficient across a distribution of satisfaction ratios (s_i = alloc / demand).
 * Returns null when undefined (no positive-demand consumers or sum of satisfaction ratios is 0).
 */
export function calculateSatisfactionGini(satisfactionRatios: number[]): number | null {
  if (satisfactionRatios.length === 0) return null;
  if (satisfactionRatios.length === 1) {
    return satisfactionRatios[0] > 0 ? 0.0 : null;
  }

  const sumS = satisfactionRatios.reduce((acc, v) => acc + v, 0);
  if (sumS <= 1e-9) {
    return null; // Undefined Gini when every consumer received 0 (0 / 0)
  }

  const n = satisfactionRatios.length;
  let diffSum = 0;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      diffSum += Math.abs(satisfactionRatios[i] - satisfactionRatios[j]);
    }
  }

  const gini = diffSum / (2 * n * sumS);
  return parseFloat(Math.min(1.0, Math.max(0.0, gini)).toFixed(4));
}

function roundTo3(v: number): number {
  return parseFloat(v.toFixed(3));
}

/**
 * Executes deterministic constrained water allocation (progressive-filling heuristic).
 */
export function allocateConstrainedWater(
  requests: ConsumerRequest[],
  availableSupplyM3: number,
  options: AllocationOptions = {}
): AllocationPlanResult {
  const startTime = performance.now();
  const volumeUnit: AllocationVolumeUnit = options.volumeUnit ?? 'THOUSAND_M3';
  const deliveryHorizonHours = options.deliveryHorizonHours ?? 24;
  const infeasiblePolicy = options.infeasibleMinimumsPolicy ?? 'REJECT';

  if (!Number.isFinite(availableSupplyM3) || availableSupplyM3 < 0) {
    throw new AllocationValidationError(
      `availableSupplyM3 must be a finite non-negative number (received ${availableSupplyM3})`,
      'INVALID_SUPPLY'
    );
  }
  if (!Number.isInteger(deliveryHorizonHours) || deliveryHorizonHours <= 0) {
    throw new AllocationValidationError(
      `deliveryHorizonHours must be a positive integer (received ${deliveryHorizonHours})`,
      'INVALID_CONSUMER_FIELD'
    );
  }

  const seenIds = new Set<string>();
  const validRequests = requests.map((r) => {
    if (!r.id || r.id.trim().length === 0) {
      throw new AllocationValidationError('Consumer id must be a non-empty string', 'INVALID_CONSUMER_FIELD');
    }
    if (seenIds.has(r.id)) {
      throw new AllocationValidationError(
        `Duplicate consumer id detected: '${r.id}'`,
        'DUPLICATE_CONSUMER_ID'
      );
    }
    seenIds.add(r.id);

    if (!Number.isFinite(r.demandM3) || r.demandM3 < 0) {
      throw new AllocationValidationError(
        `Consumer ${r.id} has invalid demandM3 (${r.demandM3})`,
        'INVALID_CONSUMER_FIELD'
      );
    }
    if (!Number.isFinite(r.canalCapacityM3) || r.canalCapacityM3 < 0) {
      throw new AllocationValidationError(
        `Consumer ${r.id} has invalid canalCapacityM3 (${r.canalCapacityM3})`,
        'INVALID_CONSUMER_FIELD'
      );
    }
    if (!Number.isFinite(r.weight) || r.weight <= 0 || r.weight > 1) {
      throw new AllocationValidationError(
        `Consumer ${r.id} has invalid priority weight (${r.weight}); expected 0 < weight <= 1`,
        'INVALID_WEIGHT'
      );
    }

    const minSurv = r.minimumSurvivalM3 ?? 0;
    if (!Number.isFinite(minSurv) || minSurv < 0) {
      throw new AllocationValidationError(
        `Consumer ${r.id} has invalid minimumSurvivalM3 (${minSurv})`,
        'INVALID_CONSUMER_FIELD'
      );
    }
    const deliverableCap = Math.min(r.demandM3, r.canalCapacityM3);
    if (minSurv > deliverableCap) {
      throw new AllocationValidationError(
        `Consumer ${r.id} minimumSurvivalM3 (${minSurv}) exceeds deliverable cap min(demand=${r.demandM3}, capacity=${r.canalCapacityM3})=${deliverableCap}`,
        'INFEASIBLE_MINIMUMS'
      );
    }

    return {
      ...r,
      minimumSurvivalM3: minSurv,
    };
  });

  const totalDemandM3 = roundTo3(validRequests.reduce((acc, r) => acc + r.demandM3, 0));
  const supply = roundTo3(availableSupplyM3);
  const caps = validRequests.map((r) => Math.min(r.demandM3, r.canalCapacityM3));
  const totalDeliverableCap = roundTo3(caps.reduce((acc, c) => acc + c, 0));

  // Edge Case 0: Zero Demand or Empty Requests
  if (validRequests.length === 0 || totalDemandM3 === 0) {
    const results: ConsumerAllocationResult[] = validRequests.map((r) => ({
      id: r.id,
      name: r.name,
      region: r.region,
      demandM3: r.demandM3,
      weight: r.weight,
      canalCapacityM3: r.canalCapacityM3,
      allocatedM3: 0,
      satisfactionPct: null,
      unmetM3: 0,
      reasonCode: 'ZERO_DEMAND_REQUESTED',
    }));
    return {
      status: 'ZERO_DEMAND',
      volumeUnit,
      deliveryHorizonHours,
      totalSupplyM3: supply,
      totalAllocatedM3: 0,
      totalDemandM3: 0,
      unmetDemandM3: 0,
      residualSupplyM3: supply,
      giniIndex: null,
      giniNote: 'Gini coefficient is undefined when total consumer demand is zero.',
      satisfactionDistribution: results.map(() => null),
      allocations: results,
      policyDescription:
        'Deterministic Progressive-Filling Heuristic (Zero Demand; not MILP)',
      solveDurationMs: parseFloat((performance.now() - startTime).toFixed(2)),
    };
  }

  // Edge Case 1: Zero Supply
  if (supply === 0) {
    const totalMin = validRequests.reduce((acc, r) => acc + r.minimumSurvivalM3, 0);
    if (totalMin > 0 && infeasiblePolicy === 'REJECT') {
      throw new AllocationValidationError(
        `Infeasible minimum survival requirements (${totalMin}) exceed available supply (0)`,
        'INFEASIBLE_MINIMUMS'
      );
    }
    const results: ConsumerAllocationResult[] = validRequests.map((r) => ({
      id: r.id,
      name: r.name,
      region: r.region,
      demandM3: r.demandM3,
      weight: r.weight,
      canalCapacityM3: r.canalCapacityM3,
      allocatedM3: 0,
      satisfactionPct: r.demandM3 > 0 ? 0 : null,
      unmetM3: r.demandM3,
      reasonCode: 'ZERO_SUPPLY_AVAILABLE',
    }));

    return {
      status: 'ZERO_SUPPLY',
      volumeUnit,
      deliveryHorizonHours,
      totalSupplyM3: 0,
      totalAllocatedM3: 0,
      totalDemandM3,
      unmetDemandM3: totalDemandM3,
      residualSupplyM3: 0,
      giniIndex: null,
      giniNote: 'Gini coefficient is undefined (0/0) when zero water is allocated to all consumers.',
      satisfactionDistribution: results.map((a) => a.satisfactionPct),
      allocations: results,
      policyDescription:
        'Deterministic Progressive-Filling Heuristic (Zero Available Supply; not MILP)',
      solveDurationMs: parseFloat((performance.now() - startTime).toFixed(2)),
    };
  }

  const allocated = new Array<number>(validRequests.length).fill(0);
  const reasonCodes = new Array<string>(validRequests.length).fill('');
  let status: AllocationPlanResult['status'] = 'FEASIBLE';

  // Case 2: Supply meets or exceeds all deliverable caps
  if (supply >= totalDeliverableCap) {
    for (let i = 0; i < validRequests.length; i++) {
      allocated[i] = caps[i];
      if (validRequests[i].demandM3 === 0) {
        reasonCodes[i] = 'ZERO_DEMAND_REQUESTED';
      } else if (caps[i] === validRequests[i].demandM3) {
        reasonCodes[i] = 'DEMAND_FULLY_SATISFIED';
      } else {
        reasonCodes[i] = 'CANAL_CAPACITY_CONSTRAINED';
      }
    }

    const positiveDemandRatios = validRequests
      .map((r, i) => (r.demandM3 > 0 ? allocated[i] / r.demandM3 : null))
      .filter((x): x is number => x !== null);

    const allocations: ConsumerAllocationResult[] = validRequests.map((r, i) => ({
      id: r.id,
      name: r.name,
      region: r.region,
      demandM3: r.demandM3,
      weight: r.weight,
      canalCapacityM3: r.canalCapacityM3,
      allocatedM3: roundTo3(allocated[i]),
      satisfactionPct: r.demandM3 > 0 ? Math.round((allocated[i] / r.demandM3) * 100) : null,
      unmetM3: roundTo3(r.demandM3 - allocated[i]),
      reasonCode: reasonCodes[i],
    }));

    const totalAllocated = roundTo3(allocations.reduce((acc, a) => acc + a.allocatedM3, 0));
    const giniIndex = calculateSatisfactionGini(positiveDemandRatios);

    return {
      status: 'FEASIBLE',
      volumeUnit,
      deliveryHorizonHours,
      totalSupplyM3: supply,
      totalAllocatedM3: totalAllocated,
      totalDemandM3,
      unmetDemandM3: roundTo3(totalDemandM3 - totalAllocated),
      residualSupplyM3: roundTo3(supply - totalAllocated),
      giniIndex,
      giniNote:
        giniIndex === null
          ? 'Gini coefficient undefined.'
          : 'Computed empirically over positive-demand satisfaction ratios.',
      satisfactionDistribution: allocations.map((a) => a.satisfactionPct),
      allocations,
      policyDescription:
        'Deterministic Progressive-Filling Heuristic (Ample Supply: Complete Deliverable Satisfaction; not MILP)',
      solveDurationMs: parseFloat((performance.now() - startTime).toFixed(2)),
    };
  }

  // Case 3: Scarce Supply (supply < totalDeliverableCap)
  let remainingSupply = supply;
  const totalMin = validRequests.reduce((acc, r) => acc + r.minimumSurvivalM3, 0);

  if (totalMin > 0) {
    if (remainingSupply < totalMin) {
      if (infeasiblePolicy === 'REJECT') {
        throw new AllocationValidationError(
          `Infeasible minimum survival requirements: total minimum (${totalMin}) exceeds available supply (${remainingSupply})`,
          'INFEASIBLE_MINIMUMS'
        );
      }
      const prorationFactor = remainingSupply / totalMin;
      for (let i = 0; i < validRequests.length; i++) {
        allocated[i] = Math.min(caps[i], validRequests[i].minimumSurvivalM3 * prorationFactor);
        reasonCodes[i] = 'MINIMUMS_PRORATED_DUE_TO_SEVERE_DEFICIT';
      }
      remainingSupply = 0;
      status = 'MINIMUMS_PRORATED';
    } else {
      for (let i = 0; i < validRequests.length; i++) {
        allocated[i] = validRequests[i].minimumSurvivalM3;
      }
      remainingSupply = Math.max(0, remainingSupply - totalMin);
    }
  }

  // Phase B: Priority-Weighted Progressive Filling up to deliverable caps
  let activeIndices = validRequests
    .map((_, i) => i)
    .filter((i) => allocated[i] < caps[i] - 1e-9);

  while (remainingSupply > 1e-6 && activeIndices.length > 0) {
    const totalActiveWeight = activeIndices.reduce(
      (acc, i) => acc + validRequests[i].weight * (caps[i] - allocated[i]),
      0
    );
    if (totalActiveWeight <= 0) break;

    let newlyCappedThisIteration = false;
    let allocatedThisRound = 0;

    for (const i of activeIndices) {
      const activeWeight = validRequests[i].weight * (caps[i] - allocated[i]);
      const share = remainingSupply * (activeWeight / totalActiveWeight);
      const needed = caps[i] - allocated[i];

      if (share >= needed - 1e-9) {
        allocated[i] = caps[i];
        allocatedThisRound += needed;
        reasonCodes[i] =
          caps[i] < validRequests[i].demandM3
            ? 'CANAL_CAPACITY_CONSTRAINED'
            : 'DEMAND_FULLY_SATISFIED';
        newlyCappedThisIteration = true;
      } else {
        allocated[i] += share;
        allocatedThisRound += share;
        reasonCodes[i] = 'PRIORITY_WEIGHTED_SHARE';
      }
    }

    remainingSupply = Math.max(0, remainingSupply - allocatedThisRound);
    const nextActive = activeIndices.filter((i) => allocated[i] < caps[i] - 1e-6);

    if (!newlyCappedThisIteration || nextActive.length === activeIndices.length) {
      break;
    }
    activeIndices = nextActive;
  }

  // Conservation-preserving integer/precision rounding when inputs are integers
  const allIntegers =
    Number.isInteger(supply) &&
    validRequests.every((r) => Number.isInteger(r.demandM3) && Number.isInteger(r.canalCapacityM3));

  const targetTotal = Math.min(supply, totalDeliverableCap);
  let finalAllocated: number[];

  if (allIntegers) {
    const floors = allocated.map((v, i) => Math.min(caps[i], Math.floor(v)));
    let remainder = Math.round(targetTotal - floors.reduce((a, b) => a + b, 0));
    const remainders = allocated
      .map((v, i) => ({ i, frac: v - floors[i], weight: validRequests[i].weight }))
      .filter((x) => floors[x.i] < caps[x.i])
      .sort((a, b) => b.frac - a.frac || b.weight - a.weight || a.i - b.i);

    for (const item of remainders) {
      if (remainder <= 0) break;
      floors[item.i] += 1;
      remainder -= 1;
    }
    finalAllocated = floors;
  } else {
    finalAllocated = allocated.map((v, i) => Math.min(caps[i], roundTo3(v)));
  }

  const totalAllocated = roundTo3(finalAllocated.reduce((acc, v) => acc + v, 0));
  const unmetDemand = roundTo3(Math.max(0, totalDemandM3 - totalAllocated));
  const residualSupply = roundTo3(Math.max(0, supply - totalAllocated));

  const positiveDemandRatios = validRequests
    .map((r, i) => (r.demandM3 > 0 ? finalAllocated[i] / r.demandM3 : null))
    .filter((x): x is number => x !== null);

  const allocations: ConsumerAllocationResult[] = validRequests.map((r, i) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    demandM3: r.demandM3,
    weight: r.weight,
    canalCapacityM3: r.canalCapacityM3,
    allocatedM3: finalAllocated[i],
    satisfactionPct: r.demandM3 > 0 ? Math.min(100, Math.round((finalAllocated[i] / r.demandM3) * 100)) : null,
    unmetM3: roundTo3(Math.max(0, r.demandM3 - finalAllocated[i])),
    reasonCode:
      r.demandM3 === 0
        ? 'ZERO_DEMAND_REQUESTED'
        : reasonCodes[i] || 'CONSTRAINED_ALLOCATION_COMPLETE',
  }));

  const giniIndex = calculateSatisfactionGini(positiveDemandRatios);

  return {
    status,
    volumeUnit,
    deliveryHorizonHours,
    totalSupplyM3: supply,
    totalAllocatedM3: totalAllocated,
    totalDemandM3,
    unmetDemandM3: unmetDemand,
    residualSupplyM3: residualSupply,
    giniIndex,
    giniNote:
      giniIndex === null
        ? 'Gini coefficient undefined.'
        : 'Computed empirically over positive-demand satisfaction ratios.',
    satisfactionDistribution: allocations.map((a) => a.satisfactionPct),
    allocations,
    policyDescription:
      'Deterministic Progressive-Filling Heuristic (Priority-Weighted Deficit Redistribution; not MILP)',
    solveDurationMs: parseFloat((performance.now() - startTime).toFixed(2)),
  };
}
