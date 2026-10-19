import React from 'react';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { Slider } from '../atoms/Slider';
import { Icon } from '../atoms/Icon';
import { useDomain } from '../../context/DomainContext';

export const MilpAllocationSolver: React.FC = () => {
  const {
    availableSupplyM3,
    setAvailableSupplyM3,
    allocationResult,
    runAllocation,
    isSolvingAllocation,
  } = useDomain();

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <Icon name="cpu" size={16} className="text-cyan-primary" />
            Məhdudiyyətli su paylanması modeli (Proqressiv doldurma evristikası)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Mühazirə 2 və 13: Məhdud su ehtiyatının kanal ötürücülük qabiliyyəti və prioritet əsasında ədalətli bölgüsü
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          isLoading={isSolvingAllocation}
          onClick={runAllocation}
          rightIcon={<Icon name="zap" size={14} />}
        >
          {isSolvingAllocation ? 'Hesablanır...' : 'Bölgünü yenidən hesabla'}
        </Button>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Solver Controls & Objective Parameters */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-bold text-cyan-primary">
              Məhdudiyyətlər və su ehtiyatı
            </span>
            <Badge variant="info">Deterministik evristika</Badge>
          </div>

          <Slider
            label="Mövcud su həcmi"
            value={availableSupplyM3}
            min={300}
            max={900}
            step={10}
            unit="min m³"
            onChange={setAvailableSupplyM3}
          />

          <div className="space-y-2 p-3 rounded-lg bg-navy-900 text-xs font-mono text-slate-300 border border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-500">Bölgü alqoritmi:</span>
              <span className="text-cyan-primary font-bold">Proqressiv doldurma</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Hesablama müddəti:</span>
              <span className="text-emerald-brand font-bold">{allocationResult.solveDurationMs} ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Təminat üzrə Cini əmsalı:</span>
              <span className="text-cyan-primary font-bold">{allocationResult.giniIndex}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Ayrılan toplam su:</span>
              <span className="text-emerald-brand font-bold">{allocationResult.totalAllocatedM3} min m³</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-800">
              <span className="text-slate-400 font-bold">Ödənilməyən kəsir:</span>
              <span className="text-amber-warning font-bold">{allocationResult.unmetDemandM3} min m³</span>
            </div>
            {allocationResult.residualSupplyM3 > 0 && (
              <div className="flex justify-between pt-1 border-t border-slate-800 text-slate-400">
                <span>Anbarda qalan ehtiyat:</span>
                <span className="text-cyan-primary font-bold">{allocationResult.residualSupplyM3} min m³</span>
              </div>
            )}
          </div>
        </Card>

        {/* Consumer Table */}
        <Card className="lg:col-span-2 overflow-x-auto p-0">
          <div className="p-3 border-b border-slate-800 bg-navy-850/50 flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-200">
              Regional su istifadəçiləri üzrə paylanma cədvəli
            </span>
            <Badge variant="nominal" showDot>
              Hesablanmış bölgü
            </Badge>
          </div>

          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-navy-950/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-3">İstehlakçı / Kanal</th>
                <th className="p-3 text-right">Tələbat</th>
                <th className="p-3 text-right">Buraxılış</th>
                <th className="p-3 text-right">Çəki</th>
                <th className="p-3 text-right">Ayrılan həcm</th>
                <th className="p-3 text-right">Təminat %</th>
                <th className="p-3">Səbəb kodu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {allocationResult.allocations.map((c) => (
                <tr key={c.id} className="hover:bg-navy-900/60 transition-colors">
                  <td className="p-3">
                    <div className="font-semibold text-slate-200">{c.name}</div>
                    <div className="text-[10px] text-cyan-primary">{c.region}</div>
                  </td>
                  <td className="p-3 text-right text-slate-300">{c.demandM3} min m³</td>
                  <td className="p-3 text-right text-slate-400">{c.canalCapacityM3}</td>
                  <td className="p-3 text-right text-slate-400">{c.weight}</td>
                  <td className="p-3 text-right font-bold text-emerald-brand">
                    {c.allocatedM3} min m³
                  </td>
                  <td className="p-3 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                        c.satisfactionPct >= 90
                          ? 'bg-emerald-brand/15 text-emerald-brand'
                          : c.satisfactionPct >= 75
                          ? 'bg-cyan-primary/15 text-cyan-primary'
                          : 'bg-amber-warning/15 text-amber-warning'
                      }`}
                    >
                      {c.satisfactionPct}%
                    </span>
                  </td>
                  <td className="p-3 text-[10px] text-slate-400 font-mono">
                    {c.reasonCode}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
};
