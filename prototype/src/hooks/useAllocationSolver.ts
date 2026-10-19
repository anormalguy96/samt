import { useState, useCallback } from 'react';
import type { AgriculturalConsumer } from '../types';

const initialConsumers: AgriculturalConsumer[] = [
  {
    name: 'Gəncə-Qazax Su İstifadəçiləri Birliyi',
    region: 'Şəmkirçay Kanalı',
    demand: 140,
    weight: 0.9,
    alloc: 125,
    satisfaction: 89,
    canalCapacity: 150,
  },
  {
    name: 'Mərkəzi Aran Pambıqçılıq & Taxılçılıq',
    region: 'Yuxarı Şirvan Kanalı',
    demand: 210,
    weight: 0.85,
    alloc: 175,
    satisfaction: 83,
    canalCapacity: 220,
  },
  {
    name: 'Abşeron Zeytun & Badam Bağları Aqroparkı',
    region: 'Samur-Abşeron Kanalı',
    demand: 85,
    weight: 0.75,
    alloc: 72,
    satisfaction: 85,
    canalCapacity: 100,
  },
  {
    name: 'Qarabağ Regional Suvarma Şəbəkəsi',
    region: 'Tərtərçay Baş Kanalı',
    demand: 160,
    weight: 0.95,
    alloc: 150,
    satisfaction: 94,
    canalCapacity: 180,
  },
  {
    name: 'Cənub Muğan Tərəvəzçilik Kooperativi',
    region: 'Baş Mil Kanalı',
    demand: 110,
    weight: 0.7,
    alloc: 88,
    satisfaction: 80,
    canalCapacity: 120,
  },
];

export function useAllocationSolver() {
  const [consumers, setConsumers] = useState<AgriculturalConsumer[]>(initialConsumers);
  const [totalWaterAvailable, setTotalWaterAvailable] = useState<number>(610);
  const [isSolving, setIsSolving] = useState<boolean>(false);
  const [solveStats, setSolveStats] = useState<{
    solved: boolean;
    solveTimeMs: number;
    giniIndex: number;
    totalAllocated: number;
    unmetDemand: number;
  }>({
    solved: true,
    solveTimeMs: 42,
    giniIndex: 0.08,
    totalAllocated: 610,
    unmetDemand: 95,
  });

  const runSolver = useCallback(() => {
    setIsSolving(true);
    setTimeout(() => {
      // Simulate MILP weighted allocation
      const totalDemand = consumers.reduce((acc, c) => acc + c.demand, 0);
      const ratio = Math.min(1.0, totalWaterAvailable / totalDemand);

      const updated = consumers.map((c) => {
        // priority-weighted allocation
        const alloc = Math.min(c.canalCapacity, Math.round(c.demand * ratio * (0.85 + c.weight * 0.15)));
        const satisfaction = Math.min(100, Math.round((alloc / c.demand) * 100));
        return {
          ...c,
          alloc,
          satisfaction,
        };
      });

      const totalAlloc = updated.reduce((acc, c) => acc + c.alloc, 0);

      setConsumers(updated);
      setSolveStats({
        solved: true,
        solveTimeMs: 46,
        giniIndex: 0.076,
        totalAllocated: totalAlloc,
        unmetDemand: Math.max(0, totalDemand - totalAlloc),
      });
      setIsSolving(false);
    }, 600);
  }, [consumers, totalWaterAvailable]);

  return {
    consumers,
    totalWaterAvailable,
    isSolving,
    solveStats,
    setTotalWaterAvailable,
    runSolver,
  };
}
