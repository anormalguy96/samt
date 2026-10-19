import React from 'react';
import { Card } from '../atoms/Card';
import { Badge } from '../atoms/Badge';
import { Slider } from '../atoms/Slider';
import { Icon } from '../atoms/Icon';
import { useDomain } from '../../context/DomainContext';

export const IpmvpSavingsCalculator: React.FC = () => {
  const {
    baselineFlowM3h,
    baselinePressureBar,
    postRepairFlowM3h,
    postRepairPressureBar,
    leakageExponent,
    illustrativeTariffAznM3,
    savingsResult,
    setBaselineFlowM3h,
    setBaselinePressureBar,
    setPostRepairFlowM3h,
    setPostRepairPressureBar,
    setLeakageExponent,
    setIllustrativeTariffAznM3,
  } = useDomain();

  const isPositive = savingsResult.pressureAdjustedHourlySavingsM3h > 0;

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <Icon name="chart" size={16} className="text-cyan-primary" />
            İllüstrativ fiziki su qənaəti və səmərə hesablayıcısı
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Mühazirə 1 və 2: Torricelli/FAVAD təzyiq korreksiyası əsasında normallaşdırılmış sızma fərqinin qiymətləndirilməsi
          </p>
        </div>

        <Badge variant={isPositive ? 'nominal' : 'warning'} showDot>
          {isPositive ? 'Müsbət sızma azalması' : 'Qənaət qeydə alınmayıb / Mənfi'}
        </Badge>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Input Parameters */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-bold text-cyan-primary">
              Giriş parametrləri və təzyiq şəraiti
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              İllüstrativ model
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Slider
              label="İlkin gecə axını (Q_base)"
              value={baselineFlowM3h}
              min={20}
              max={200}
              step={0.5}
              unit="m³/h"
              onChange={setBaselineFlowM3h}
            />

            <Slider
              label="İlkin şəbəkə təzyiqi (P_base)"
              value={baselinePressureBar}
              min={1.0}
              max={8.0}
              step={0.1}
              unit="bar"
              onChange={setBaselinePressureBar}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Slider
              label="Təmirdən sonrakı axın (Q_post)"
              value={postRepairFlowM3h}
              min={10}
              max={150}
              step={0.5}
              unit="m³/h"
              onChange={setPostRepairFlowM3h}
            />

            <Slider
              label="Təmirdən sonrakı təzyiq (P_post)"
              value={postRepairPressureBar}
              min={1.0}
              max={8.0}
              step={0.1}
              unit="bar"
              onChange={setPostRepairPressureBar}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <Slider
              label="Sızma dərəcə qüvvəti (α)"
              value={leakageExponent}
              min={0.5}
              max={1.5}
              step={0.05}
              unit=""
              onChange={setLeakageExponent}
            />

            <Slider
              label="İllüstrativ tarif"
              value={illustrativeTariffAznM3}
              min={0.20}
              max={1.50}
              step={0.05}
              unit="AZN/m³"
              onChange={setIllustrativeTariffAznM3}
            />
          </div>
        </Card>

        {/* Calculated Financial & Volume Savings */}
        <Card glow borderVariant={isPositive ? 'emerald' : 'critical'} className="flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-mono font-bold text-slate-100">
                Hesablanmış təzyiq korreksiyalı nəticələr
              </span>
              <Badge variant="info">Normallaşdırılmış fərq</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4 text-xs font-mono">
              <div className="p-3 rounded-lg bg-navy-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Normallaşmış baza axını:</span>
                <span className="text-slate-200 font-bold text-base">
                  {savingsResult.normalizedBaselineFlowM3h} m³/h
                </span>
                <span className="text-[10px] text-slate-500 block">P_post şəraitinə uyğun</span>
              </div>

              <div className="p-3 rounded-lg bg-navy-950 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Təzyiq korreksiyalı qənaət:</span>
                <span className={`font-bold text-base ${isPositive ? 'text-emerald-brand' : 'text-rose-critical'}`}>
                  {savingsResult.pressureAdjustedHourlySavingsM3h > 0 ? '+' : ''}
                  {savingsResult.pressureAdjustedHourlySavingsM3h} m³/h
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {isPositive ? 'Fiziki qənaət təsdiqləndi' : 'Mənfi və ya sıfır qənaət'}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-navy-950 border border-slate-800 mt-4 space-y-2 text-xs font-mono">
              <div className="flex justify-between items-baseline">
                <span className="text-slate-400">Gündəlik qənaət:</span>
                <span className={`font-bold text-base ${isPositive ? 'text-slate-200' : 'text-rose-critical'}`}>
                  {savingsResult.dailySavingsM3} m³ / gün
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
                <span className="text-slate-400">İllik layihələndirilmiş qənaət:</span>
                <span className={`font-bold text-lg ${isPositive ? 'text-emerald-brand' : 'text-rose-critical'}`}>
                  {savingsResult.projectedAnnualSavingsM3.toLocaleString('az-AZ')} m³ / il
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
                <span className="text-slate-400">İllik illüstrativ iqtisadi dəyər:</span>
                <span className={`font-bold text-xl ${isPositive ? 'text-emerald-brand' : 'text-rose-critical'}`}>
                  {savingsResult.projectedAnnualEconomicValueAzn.toLocaleString('az-AZ')} AZN / il
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1 text-[10px] font-mono text-slate-500 border-t border-slate-800/80 pt-2">
            {savingsResult.disclaimers.map((disc, idx) => (
              <div key={idx}>• {disc}</div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
