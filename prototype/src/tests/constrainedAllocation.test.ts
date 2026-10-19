import { describe, it, expect } from 'vitest';
import { 
  allocateConstrainedWater, 
  calculateSatisfactionGini,
  type ConsumerRequest 
} from '../domain/allocation/constrainedAllocation';

describe('Constrained Water Allocation (Regression Fixture & Equity)', () => {
  // Existing standard consumer requests from the prototype
  const standardConsumers: ConsumerRequest[] = [
    {
      id: 'cons-1',
      name: 'Gəncə-Qazax Su İstifadəçiləri Birliyi',
      region: 'Şəmkirçay Kanalı',
      demandM3: 140,
      weight: 0.90,
      canalCapacityM3: 150,
    },
    {
      id: 'cons-2',
      name: 'Mərkəzi Aran Pambıqçılıq & Taxılçılıq',
      region: 'Yuxarı Şirvan Kanalı',
      demandM3: 210,
      weight: 0.85,
      canalCapacityM3: 220,
    },
    {
      id: 'cons-3',
      name: 'Abşeron Zeytun & Badam Bağları Aqroparkı',
      region: 'Samur-Abşeron Kanalı',
      demandM3: 85,
      weight: 0.75,
      canalCapacityM3: 100,
    },
    {
      id: 'cons-4',
      name: 'Qarabağ Regional Suvarma Şəbəkəsi',
      region: 'Tərtərçay Baş Kanalı',
      demandM3: 160,
      weight: 0.95,
      canalCapacityM3: 180,
    },
    {
      id: 'cons-5',
      name: 'Cənub Muğan Tərəvəzçilik Kooperativi',
      region: 'Baş Mil Kanalı',
      demandM3: 110,
      weight: 0.70,
      canalCapacityM3: 120,
    },
  ];

  it('corrects the regression: with supply 900 for demand 705, all 705 must be satisfied (fixing old 689 bug)', () => {
    // Total Demand: 140 + 210 + 85 + 160 + 110 = 705 m³
    // Each canal capacity (150, 220, 100, 180, 120) strictly exceeds its demand!
    // Available supply: 900 m³
    const result = allocateConstrainedWater(standardConsumers, 900);

    // Old bug: weighted ratio calculation allocated only 689 with an unnecessary deficit of 16!
    expect(result.totalAllocatedM3).toBe(705);
    expect(result.unmetDemandM3).toBe(0);
    expect(result.residualSupplyM3).toBe(195); // 900 - 705 = 195 m³ surplus remains in reservoir
    
    // Every consumer should receive exactly 100% of their requested demand
    for (const alloc of result.allocations) {
      expect(alloc.allocatedM3).toBe(alloc.demandM3);
      expect(alloc.satisfactionPct).toBe(100);
      expect(alloc.unmetM3).toBe(0);
      expect(alloc.reasonCode).toBe('DEMAND_FULLY_SATISFIED');
    }

    // Equity: with 100% satisfaction everywhere, Gini inequality across satisfaction ratios is 0.0
    expect(result.giniIndex).toBeCloseTo(0.0, 3);
  });

  it('correctly allocates scarce supply of 610 m³ with priority redistribution and zero hardcoded stats', () => {
    const result = allocateConstrainedWater(standardConsumers, 610);

    // Conservation check: total allocated must equal available supply
    expect(result.totalAllocatedM3).toBe(610);
    expect(result.unmetDemandM3).toBe(95); // 705 - 610 = 95 m³ unmet deficit
    expect(result.residualSupplyM3).toBe(0);

    // Each consumer respects 0 <= alloc <= min(demand, capacity)
    for (const alloc of result.allocations) {
      expect(alloc.allocatedM3).toBeGreaterThan(0);
      expect(alloc.allocatedM3).toBeLessThanOrEqual(alloc.demandM3);
      expect(alloc.allocatedM3).toBeLessThanOrEqual(alloc.canalCapacityM3);
    }

    // Higher priority consumers receive higher satisfaction
    const qarabag = result.allocations.find((a) => a.id === 'cons-4')!; // weight 0.95
    const cenubMugan = result.allocations.find((a) => a.id === 'cons-5')!; // weight 0.70
    expect(qarabag.satisfactionPct).toBeGreaterThanOrEqual(cenubMugan.satisfactionPct);

    // Computed Gini must be a realistic non-zero decimal, not a hardcoded constant
    expect(result.giniIndex).toBeGreaterThan(0.0);
    expect(result.giniIndex).toBeLessThan(0.3);
  });

  it('handles zero supply gracefully', () => {
    const result = allocateConstrainedWater(standardConsumers, 0);
    expect(result.totalAllocatedM3).toBe(0);
    expect(result.unmetDemandM3).toBe(705);
    expect(result.residualSupplyM3).toBe(0);
    expect(result.giniIndex).toBe(0.0);
  });

  it('handles canal capacity bottlenecks capping allocation below demand', () => {
    const constrainedBottlenecks: ConsumerRequest[] = [
      {
        id: 'c-bottleneck',
        name: 'Choked Canal Farm',
        region: 'Silt Canal',
        demandM3: 200,
        weight: 0.9,
        canalCapacityM3: 80, // Bottleneck: capacity 80 < demand 200
      },
      {
        id: 'c-open',
        name: 'Open Canal Farm',
        region: 'Modern Canal',
        demandM3: 200,
        weight: 0.9,
        canalCapacityM3: 300,
      },
    ];

    const result = allocateConstrainedWater(constrainedBottlenecks, 500);
    const choked = result.allocations.find((a) => a.id === 'c-bottleneck')!;
    const open = result.allocations.find((a) => a.id === 'c-open')!;

    // Choked farm cannot exceed canal capacity of 80 despite ample water
    expect(choked.allocatedM3).toBe(80);
    expect(choked.reasonCode).toBe('CANAL_CAPACITY_CONSTRAINED');
    // Open farm receives full 200
    expect(open.allocatedM3).toBe(200);
  });

  it('computes Gini coefficient correctly across named satisfaction distributions', () => {
    // Perfectly equal satisfaction (all 80%)
    expect(calculateSatisfactionGini([0.8, 0.8, 0.8, 0.8])).toBe(0.0);

    // Unequal satisfaction
    const unequalGini = calculateSatisfactionGini([1.0, 0.5, 0.25, 0.75]);
    expect(unequalGini).toBeGreaterThan(0.1);
    expect(unequalGini).toBeLessThan(0.5);

    // Extreme inequality: one consumer gets 100%, others get 0%
    const extremeGini = calculateSatisfactionGini([1.0, 0.0, 0.0, 0.0]);
    expect(extremeGini).toBeCloseTo(0.75, 2);
  });
});
