import { useMemo } from 'react';
import { 
  evaluateMinimumNightFlow, 
  DEFAULT_BAKU_NIGHT_WINDOW 
} from '../domain/nightflow/nightWindowFilter';
import type { FlowSample } from '../domain/balance/flowIntegration';

export interface HourlyFlowPoint {
  hour: number;
  totalFlow: number;
  legitimateUsage: number;
  tankRefill: number;
  backgroundLeak: number;
  burstTransient: number;
}

export interface UseMnfAnalysisProps {
  dmaId?: string;
  hasBurstAnomaly?: boolean;
  hasTankRefill?: boolean;
}

const DMA_PROFILES: Record<string, { multiplier: number; baselineMnf: number }> = {
  'DMA-YASAMAL-04': { multiplier: 1.0, baselineMnf: 25.0 },
  'DMA-NASIMI-02': { multiplier: 1.35, baselineMnf: 34.0 },
  'DMA-NIZAMI-07': { multiplier: 1.55, baselineMnf: 40.0 },
  'DMA-SABAIL-01': { multiplier: 0.82, baselineMnf: 20.0 },
  'RES-CEYRANBATAN-01': { multiplier: 8.5, baselineMnf: 250.0 },
};

export function useMnfAnalysis({
  dmaId = 'DMA-YASAMAL-04',
  hasBurstAnomaly = true,
  hasTankRefill = true,
}: UseMnfAnalysisProps = {}) {
  const profile = DMA_PROFILES[dmaId] || DMA_PROFILES['DMA-YASAMAL-04'];

  const hourlyData = useMemo<HourlyFlowPoint[]>(() => {
    const data: HourlyFlowPoint[] = [];
    const baseCurve = [
      120, 95, 82, 78, 85, 130, 240, 380, 420, 390, 360, 350,
      340, 335, 330, 345, 380, 430, 450, 410, 340, 260, 190, 145
    ];

    for (let h = 0; h < 24; h++) {
      const base = baseCurve[h] * profile.multiplier;
      // Explicit Asia/Baku night window: [02:00, 04:00) => h = 2 and h = 3
      const isNight = h >= 2 && h < 4;
      const tank = hasTankRefill ? (isNight ? 18 : (h >= 5 && h <= 8 ? 25 : 5)) : 5;
      const legitimate = Math.max(12, base * (isNight ? 0.25 : 0.75));
      const backgroundLeak = 20 * profile.multiplier;
      const burst = (hasBurstAnomaly && (h >= 14 || isNight)) ? 38.4 : 0;

      data.push({
        hour: h,
        totalFlow: Math.round(legitimate + tank + backgroundLeak + burst),
        legitimateUsage: Math.round(legitimate),
        tankRefill: Math.round(tank),
        backgroundLeak: Math.round(backgroundLeak),
        burstTransient: Math.round(burst),
      });
    }
    return data;
  }, [profile, hasBurstAnomaly, hasTankRefill]);

  // Minimum Night Flow statistics using domain evaluateMinimumNightFlow
  const mnfStats = useMemo(() => {
    // Generate flow samples for the 24 hours
    const samples: FlowSample[] = hourlyData.map((d) => {
      // 2026-10-20 at hour d.hour in UTC+4: (d.hour - 4 + 24) % 24 in UTC
      const date = new Date(Date.UTC(2026, 9, 20, (d.hour - 4 + 24) % 24, 0, 0));
      return {
        timestamp: date,
        flowM3h: d.totalFlow,
      };
    });

    const evalResult = evaluateMinimumNightFlow(samples, profile.baselineMnf, DEFAULT_BAKU_NIGHT_WINDOW);

    // Night points strictly in [02:00, 04:00)
    const nightPoints = hourlyData.filter((d) => d.hour >= 2 && d.hour < 4);
    const avgTotal = nightPoints.length > 0 
      ? nightPoints.reduce((acc, p) => acc + p.totalFlow, 0) / nightPoints.length 
      : 0;
    const avgLegit = nightPoints.length > 0 
      ? nightPoints.reduce((acc, p) => acc + p.legitimateUsage, 0) / nightPoints.length 
      : 0;
    const avgTank = nightPoints.length > 0 
      ? nightPoints.reduce((acc, p) => acc + p.tankRefill, 0) / nightPoints.length 
      : 0;

    return {
      mnfTotal: Math.round(evalResult.percentile5FlowM3h || avgTotal),
      legitimateDomestic: Math.round(avgLegit),
      tankRefillChattering: Math.round(avgTank),
      netPhysicalLoss: Math.round(evalResult.excessNightFlowM3h),
      nrwNightSharePct: avgTotal > 0 ? Math.round((evalResult.excessNightFlowM3h / avgTotal) * 100) : 0,
      isAnomalyDetected: evalResult.isAnomalyDetected,
      detectionReason: evalResult.detectionReason,
    };
  }, [hourlyData, profile.baselineMnf]);

  return {
    hourlyData,
    mnfStats,
    dmaProfile: profile,
  };
}
