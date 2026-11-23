import { describe, it, expect } from 'vitest';
import {
  allocateConstrainedWater,
  AllocationValidationError,
  calculateSatisfactionGini,
  type ConsumerRequest,
} from '../domain/allocation/constrainedAllocation';

describe('Constrained Water Allocation Heuristic & Edge-Case Hardening (SAMT v1.1.0)', () => {
  const standardConsumers: ConsumerRequest[] = [
    { id: 'cons-1', name: 'Gəncə-Qazax', region: 'Şəmkirçay', demandM3: 140, weight: 0.9, canalCapacityM3: 150 },
    { id: 'cons-2', name: 'Mərkəzi Aran', region: 'Yuxarı Şirvan', demandM3: 210, weight: 0.85, canalCapacityM3: 220 },
    { id: 'cons-3', name: 'Abşeron', region: 'Samur-Abşeron', demandM3: 85, weight: 0.75, canalCapacityM3: 100 },
    { id: 'cons-4', name: 'Qarabağ', region: 'Tərtərçay', demandM3: 160, weight: 0.95, canalCapacityM3: 180 },
    { id: 'cons-5', name: 'Cənub Muğan', region: 'Baş Mil', demandM3: 110, weight: 0.7, canalCapacityM3: 120 },
  ];

  it('preserves the 900 supply / 705 demand regression: 705 allocated, 0 unmet, 195 residual, Gini 0.000', () => {
    const result = allocateConstrainedWater(standardConsumers, 900, {
      volumeUnit: 'THOUSAND_M3',
      deliveryHorizonHours: 24,
    });

    expect(result.status).toBe('FEASIBLE');
    expect(result.volumeUnit).toBe('THOUSAND_M3');
    expect(result.deliveryHorizonHours).toBe(24);
    expect(result.totalAllocatedM3).toBe(705);
    expect(result.unmetDemandM3).toBe(0);
    expect(result.residualSupplyM3).toBe(195);
    expect(result.giniIndex).toBe(0.0);
    expect(result.policyDescription).toContain('Heuristic');
    expect(result.policyDescription).toContain('not MILP');
  });

  it('preserves strict conservation for scarce 610 supply case', () => {
    const result = allocateConstrainedWater(standardConsumers, 610);
    const sumAllocated = result.allocations.reduce((acc, a) => acc + a.allocatedM3, 0);

    expect(sumAllocated).toBe(610);
    expect(result.totalAllocatedM3).toBe(610);
    expect(result.unmetDemandM3).toBe(95);
    expect(result.residualSupplyM3).toBe(0);
    expect(result.giniIndex).not.toBeNull();
    expect(result.giniIndex!).toBeGreaterThan(0);

    const qarabag = result.allocations.find((a) => a.id === 'cons-4')!;
    const mugan = result.allocations.find((a) => a.id === 'cons-5')!;
    expect(qarabag.satisfactionPct!).toBeGreaterThanOrEqual(mugan.satisfactionPct!);
  });

  it('handles zero supply, zero demand, and undefined Gini cleanly (giniIndex = null)', () => {
    const zeroSupply = allocateConstrainedWater(standardConsumers, 0);
    expect(zeroSupply.status).toBe('ZERO_SUPPLY');
    expect(zeroSupply.totalAllocatedM3).toBe(0);
    expect(zeroSupply.giniIndex).toBeNull();

    const zeroDemand = allocateConstrainedWater(
      [{ id: 'c0', name: 'Idle Farm', region: 'R1', demandM3: 0, weight: 0.8, canalCapacityM3: 50 }],
      100
    );
    expect(zeroDemand.status).toBe('ZERO_DEMAND');
    expect(zeroDemand.residualSupplyM3).toBe(100);
    expect(zeroDemand.giniIndex).toBeNull();
    expect(calculateSatisfactionGini([0, 0, 0])).toBeNull();
  });

  it('enforces canal capacity bottlenecks capping allocation below demand', () => {
    const result = allocateConstrainedWater(
      [
        { id: 'c1', name: 'Choked', region: 'R', demandM3: 200, weight: 0.9, canalCapacityM3: 80 },
        { id: 'c2', name: 'Open', region: 'R', demandM3: 200, weight: 0.9, canalCapacityM3: 300 },
      ],
      500
    );
    expect(result.allocations[0].allocatedM3).toBe(80);
    expect(result.allocations[0].reasonCode).toBe('CANAL_CAPACITY_CONSTRAINED');
    expect(result.allocations[1].allocatedM3).toBe(200);
  });

  it('rejects duplicate consumer IDs, invalid weights, negative values, and infeasible minimums', () => {
    expect(() =>
      allocateConstrainedWater(
        [
          { id: 'dup', name: 'A', region: 'R', demandM3: 50, weight: 0.5, canalCapacityM3: 60 },
          { id: 'dup', name: 'B', region: 'R', demandM3: 50, weight: 0.5, canalCapacityM3: 60 },
        ],
        100
      )
    ).toThrow(AllocationValidationError);

    expect(() =>
      allocateConstrainedWater(
        [{ id: 'bad-w', name: 'A', region: 'R', demandM3: 50, weight: 1.5, canalCapacityM3: 60 }],
        100
      )
    ).toThrow(AllocationValidationError);

    expect(() =>
      allocateConstrainedWater(
        [{ id: 'neg-s', name: 'A', region: 'R', demandM3: 50, weight: 0.5, canalCapacityM3: 60 }],
        -10
      )
    ).toThrow(AllocationValidationError);

    // Infeasible minimum survival total (120 > supply 100) rejected under default policy
    expect(() =>
      allocateConstrainedWater(
        [
          { id: 'm1', name: 'A', region: 'R', demandM3: 100, weight: 0.8, canalCapacityM3: 100, minimumSurvivalM3: 70 },
          { id: 'm2', name: 'B', region: 'R', demandM3: 100, weight: 0.8, canalCapacityM3: 100, minimumSurvivalM3: 50 },
        ],
        100,
        { infeasibleMinimumsPolicy: 'REJECT' }
      )
    ).toThrow(/Infeasible minimum survival/);

    // Explicit PRORATE mode handles infeasible minimums transparently
    const prorated = allocateConstrainedWater(
      [
        { id: 'm1', name: 'A', region: 'R', demandM3: 100, weight: 0.8, canalCapacityM3: 100, minimumSurvivalM3: 70 },
        { id: 'm2', name: 'B', region: 'R', demandM3: 100, weight: 0.8, canalCapacityM3: 100, minimumSurvivalM3: 50 },
      ],
      100,
      { infeasibleMinimumsPolicy: 'PRORATE' }
    );
    expect(prorated.status).toBe('MINIMUMS_PRORATED');
    expect(prorated.totalAllocatedM3).toBe(100);
  });
});
