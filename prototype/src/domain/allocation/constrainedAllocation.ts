/**
 * Constrained Water Allocation Domain Policy (Lecture 2, 3, & 13: Value-Sensitive Design)
 * Implements deterministic progressive filling with priority-weighted surplus redistribution.
 * 
 * Regressed Bug Fixed:
 * When total demand is 705 and each canal capacity exceeds demand, available supply of 900
 * must satisfy all 705 m³ with zero deficit (fixing the old 689 / deficit 16 rounding bug).
 * With supply 610, calculates exact allocations and actual Gini index without hardcoded constants.
 */

export interface ConsumerRequest {
  id: string;
  name: string;
  region: string;
  demandM3: number;
  weight: number; // Priority weight e.g. 0.70 to 0.95
  canalCapacityM3: number;
  minimumSurvivalM3?: number; // Configurable baseline demonstration threshold
}

export interface ConsumerAllocationResult {
  id: string;
  name: string;
  region: string;
  demandM3: number;
  weight: number;
  canalCapacityM3: number;
  allocatedM3: number;
  satisfactionPct: number;
  unmetM3: number;
  reasonCode: string;
}

export interface AllocationPlanResult {
  totalSupplyM3: number;
  totalAllocatedM3: number;
  totalDemandM3: number;
  unmetDemandM3: number;
  residualSupplyM3: number;
  giniIndex: number;
  satisfactionDistribution: number[];
  allocations: ConsumerAllocationResult[];
  policyDescription: string;
  solveDurationMs: number;
}

/**
 * Calculates Gini coefficient across a distribution of satisfaction ratios (s_i = alloc / demand).
 * Gini = sum_i sum_j |s_i - s_j| / (2 * n * sum_i s_i)
 */
export function calculateSatisfactionGini(satisfactionRatios: number[]): number {
  if (satisfactionRatios.length <= 1) return 0.0;
  
  const sumS = satisfactionRatios.reduce((acc, v) => acc + v, 0);
  if (sumS <= 0.00001) return 0.0; // All zero is zero inequality in satisfaction

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

/**
 * Executes deterministic constrained water allocation.
 */
export function allocateConstrainedWater(
  requests: ConsumerRequest[],
  availableSupplyM3: number
): AllocationPlanResult {
  const startTime = performance.now();

  // Validate inputs
  const validRequests = requests.map((r) => ({
    ...r,
    demandM3: Math.max(0, Number.isFinite(r.demandM3) ? r.demandM3 : 0),
    weight: Math.max(0.01, Number.isFinite(r.weight) ? r.weight : 1.0),
    canalCapacityM3: Math.max(0, Number.isFinite(r.canalCapacityM3) ? r.canalCapacityM3 : 0),
    minimumSurvivalM3: Math.max(0, Number.isFinite(r.minimumSurvivalM3 ?? 0) ? (r.minimumSurvivalM3 ?? 0) : 0),
  }));

  const totalDemandM3 = validRequests.reduce((acc, r) => acc + r.demandM3, 0);
  const supply = Math.max(0, Number.isFinite(availableSupplyM3) ? availableSupplyM3 : 0);

  // Each consumer's deliverable upper bound is min(demand, capacity)
  const caps = validRequests.map((r) => Math.min(r.demandM3, r.canalCapacityM3));
  const totalDeliverableCap = caps.reduce((acc, c) => acc + c, 0);

  // Allocations array initialized to zero
  const allocated = new Array(validRequests.length).fill(0);
  const reasonCodes = new Array(validRequests.length).fill('');

  let remainingSupply = supply;

  // Edge Case 1: Zero Supply
  if (supply <= 0) {
    const results: ConsumerAllocationResult[] = validRequests.map((r) => ({
      id: r.id,
      name: r.name,
      region: r.region,
      demandM3: r.demandM3,
      weight: r.weight,
      canalCapacityM3: r.canalCapacityM3,
      allocatedM3: 0,
      satisfactionPct: 0,
      unmetM3: r.demandM3,
      reasonCode: 'ZERO_SUPPLY_AVAILABLE',
    }));

    return {
      totalSupplyM3: 0,
      totalAllocatedM3: 0,
      totalDemandM3,
      unmetDemandM3: totalDemandM3,
      residualSupplyM3: 0,
      giniIndex: 0.0,
      satisfactionDistribution: results.map(() => 0),
      allocations: results,
      policyDescription: 'Constrained Progressive-Filling Policy (Zero Available Water)',
      solveDurationMs: parseFloat((performance.now() - startTime).toFixed(2)),
    };
  }

  // Edge Case 2: Supply exceeds or meets all deliverable caps (REGRESSION FIX)
  if (supply >= totalDeliverableCap) {
    for (let i = 0; i < validRequests.length; i++) {
      allocated[i] = caps[i];
      if (caps[i] === validRequests[i].demandM3) {
        reasonCodes[i] = 'DEMAND_FULLY_SATISFIED';
      } else {
        reasonCodes[i] = 'CANAL_CAPACITY_CONSTRAINED';
      }
    }
    const totalAllocated = totalDeliverableCap;
    const residual = supply - totalAllocated;
    const unmet = totalDemandM3 - totalAllocated;

    const satisfactionRatios = validRequests.map((r, i) => 
      r.demandM3 > 0 ? allocated[i] / r.demandM3 : 1.0
    );

    const allocations: ConsumerAllocationResult[] = validRequests.map((r, i) => ({
      id: r.id,
      name: r.name,
      region: r.region,
      demandM3: r.demandM3,
      weight: r.weight,
      canalCapacityM3: r.canalCapacityM3,
      allocatedM3: Math.round(allocated[i]),
      satisfactionPct: Math.round((allocated[i] / (r.demandM3 || 1)) * 100),
      unmetM3: Math.round(r.demandM3 - allocated[i]),
      reasonCode: reasonCodes[i],
    }));

    return {
      totalSupplyM3: supply,
      totalAllocatedM3: Math.round(totalAllocated),
      totalDemandM3,
      unmetDemandM3: Math.round(unmet),
      residualSupplyM3: Math.round(residual),
      giniIndex: calculateSatisfactionGini(satisfactionRatios),
      satisfactionDistribution: allocations.map((a) => a.satisfactionPct),
      allocations,
      policyDescription: 'Deterministic Constrained Progressive-Filling (Ample Supply: Complete Demand Satisfaction)',
      solveDurationMs: parseFloat((performance.now() - startTime).toFixed(2)),
    };
  }

  // Case 3: Supply is scarce (supply < totalDeliverableCap)
  // Phase A: Guarantee minimum survival thresholds if configured
  const totalMin = validRequests.reduce((acc, r) => acc + r.minimumSurvivalM3, 0);
  if (totalMin > 0) {
    if (remainingSupply < totalMin) {
      // Infeasible minimums: Prorate survival thresholds proportionally
      const prorationFactor = remainingSupply / totalMin;
      for (let i = 0; i < validRequests.length; i++) {
        allocated[i] = Math.min(caps[i], validRequests[i].minimumSurvivalM3 * prorationFactor);
        reasonCodes[i] = 'MINIMUMS_PRORATED_DUE_TO_SEVERE_DEFICIT';
      }
      remainingSupply = 0;
    } else {
      for (let i = 0; i < validRequests.length; i++) {
        allocated[i] = Math.min(caps[i], validRequests[i].minimumSurvivalM3);
      }
      remainingSupply -= totalMin;
    }
  }

  // Phase B: Progressive Filling & Priority-Weighted Surplus Redistribution
  // Iteratively distribute remainingSupply among consumers that have not yet reached caps[i]
  let activeIndices = validRequests
    .map((_, i) => i)
    .filter((i) => allocated[i] < caps[i]);

  while (remainingSupply > 0.001 && activeIndices.length > 0) {
    const totalActiveWeight = activeIndices.reduce(
      (acc, i) => acc + validRequests[i].weight * (caps[i] - allocated[i]), 
      0
    );

    let newlyCappedThisIteration = false;
    let allocatedThisRound = 0;

    for (const i of activeIndices) {
      const activeWeight = validRequests[i].weight * (caps[i] - allocated[i]);
      const share = totalActiveWeight > 0 
        ? remainingSupply * (activeWeight / totalActiveWeight)
        : 0;
      const needed = caps[i] - allocated[i];

      if (share >= needed) {
        allocated[i] = caps[i];
        allocatedThisRound += needed;
        reasonCodes[i] = caps[i] < validRequests[i].demandM3 
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

    // Re-filter active consumers
    const nextActive = activeIndices.filter((i) => allocated[i] < caps[i] - 0.001);
    
    // If no progress was made or all capped, break
    if (!newlyCappedThisIteration || nextActive.length === activeIndices.length) {
      break;
    }
    activeIndices = nextActive;
  }

  // Final rounding to integers for reporting while conserving sum
  let sumRounded = 0;
  const roundedAllocations = allocated.map((val, i) => {
    const r = Math.min(caps[i], Math.round(val));
    sumRounded += r;
    return r;
  });

  // Adjust any rounding delta against the lowest unmet priority consumer to ensure sum <= supply
  let delta = sumRounded - Math.min(supply, totalDeliverableCap);
  if (delta !== 0) {
    for (let i = roundedAllocations.length - 1; i >= 0 && delta > 0; i--) {
      const reduction = Math.min(delta, roundedAllocations[i]);
      roundedAllocations[i] -= reduction;
      delta -= reduction;
    }
  }

  const totalAllocated = roundedAllocations.reduce((acc, v) => acc + v, 0);
  const unmetDemand = totalDemandM3 - totalAllocated;
  const residualSupply = supply - totalAllocated;

  const satisfactionRatios = validRequests.map((r, i) => 
    r.demandM3 > 0 ? roundedAllocations[i] / r.demandM3 : 1.0
  );

  const allocations: ConsumerAllocationResult[] = validRequests.map((r, i) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    demandM3: r.demandM3,
    weight: r.weight,
    canalCapacityM3: r.canalCapacityM3,
    allocatedM3: roundedAllocations[i],
    satisfactionPct: Math.min(100, Math.round((roundedAllocations[i] / (r.demandM3 || 1)) * 100)),
    unmetM3: Math.max(0, r.demandM3 - roundedAllocations[i]),
    reasonCode: reasonCodes[i] || 'CONSTRAINED_ALLOCATION_COMPLETE',
  }));

  const giniIndex = calculateSatisfactionGini(satisfactionRatios);

  return {
    totalSupplyM3: supply,
    totalAllocatedM3: totalAllocated,
    totalDemandM3,
    unmetDemandM3: unmetDemand,
    residualSupplyM3: Math.max(0, residualSupply),
    giniIndex,
    satisfactionDistribution: allocations.map((a) => a.satisfactionPct),
    allocations,
    policyDescription: 'Deterministic Constrained Progressive-Filling (Deficit Redistribution)',
    solveDurationMs: parseFloat((performance.now() - startTime).toFixed(2)),
  };
}
