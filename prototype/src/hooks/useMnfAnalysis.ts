import { useMemo } from 'react';
import {
  evaluateMinimumNightFlow,
  DEFAULT_BAKU_NIGHT_WINDOW,
  getLocalDateKey,
  getNightWindowBoundsUtc,
} from '../domain/nightflow/nightWindowFilter';
import type { FlowSample } from '../domain/balance/flowIntegration';
import type { Clock } from '../domain/ports/Clock';
import { SystemClock } from '../domain/ports/Clock';
import type { ApiNightFlowResponse } from '../services/apiClient';

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
  clock?: Clock;
  clockTick?: number;
  hasBurstAnomaly?: boolean;
  hasTankRefill?: boolean;
  persistedNightFlow?: ApiNightFlowResponse | null;
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
  clock,
  clockTick = 0,
  hasBurstAnomaly = true,
  hasTankRefill = true,
  persistedNightFlow = null,
}: UseMnfAnalysisProps = {}) {
  const profile = DMA_PROFILES[dmaId] || DMA_PROFILES['DMA-YASAMAL-04'];
  const activeClock = clock ?? new SystemClock();

  const hourlyData = useMemo<HourlyFlowPoint[]>(() => {
    const data: HourlyFlowPoint[] = [];
    const baseCurve = [
      120, 95, 82, 78, 85, 130, 240, 380, 420, 390, 360, 350,
      340, 335, 330, 345, 380, 430, 450, 410, 340, 260, 190, 145,
    ];

    for (let h = 0; h < 24; h++) {
      const base = baseCurve[h] * profile.multiplier;
      const isNight = h >= 2 && h < 4;
      const tank = hasTankRefill ? (isNight ? 18 : h >= 5 && h <= 8 ? 25 : 5) : 5;
      const legitimate = Math.max(12, base * (isNight ? 0.25 : 0.75));
      const backgroundLeak = 20 * profile.multiplier;
      const burst = hasBurstAnomaly && (h >= 14 || isNight) ? 38.4 : 0;

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

  const mnfStats = useMemo(() => {
    // When backed by real persisted PostgreSQL night-flow telemetry, surface authoritative API values
    if (persistedNightFlow) {
      const total = persistedNightFlow.percentile_5_flow_m3h;
      const excess = persistedNightFlow.excess_night_flow_m3h;
      return {
        mnfTotal: Number(total.toFixed(1)),
        legitimateDomestic: Number(Math.min(total, persistedNightFlow.baseline_mnf_m3h).toFixed(1)),
        tankRefillChattering: 0,
        netPhysicalLoss: Number(excess.toFixed(1)),
        nrwNightSharePct: total > 0 ? Math.round((excess / total) * 100) : 0,
        isAnomalyDetected: persistedNightFlow.is_anomaly_detected,
        detectionReason: persistedNightFlow.detection_reason,
        sampleCount: persistedNightFlow.sample_count,
        coverageRatio: persistedNightFlow.coverage_ratio,
        status: persistedNightFlow.status,
        sourceDateAzt: persistedNightFlow.date_azt,
        isPersisted: true,
      };
    }

    // Demo mode: derive timestamps strictly from the injected Clock in Asia/Baku time (no hardcoded 2026-10-20)
    const localDateKey = getLocalDateKey(activeClock.now(), DEFAULT_BAKU_NIGHT_WINDOW.timezoneOffsetHours);
    const { windowStart } = getNightWindowBoundsUtc(localDateKey, DEFAULT_BAKU_NIGHT_WINDOW);
    const midnightUtcMs = windowStart.getTime() - DEFAULT_BAKU_NIGHT_WINDOW.startHour * 3600 * 1000;

    const samples: FlowSample[] = [];
    for (const d of hourlyData) {
      // Emit 4 quarter-hour points per hour so nocturnal [02:00, 04:00) has 8 samples spanning [02:00..03:45]
      for (let q = 0; q < 4; q++) {
        samples.push({
          timestamp: new Date(midnightUtcMs + d.hour * 3600 * 1000 + q * 15 * 60 * 1000),
          flowM3h: d.totalFlow,
        });
      }
    }

    const evalResult = evaluateMinimumNightFlow(samples, profile.baselineMnf, DEFAULT_BAKU_NIGHT_WINDOW);

    const nightPoints = hourlyData.filter((d) => d.hour >= 2 && d.hour < 4);
    const avgTotal =
      nightPoints.length > 0
        ? nightPoints.reduce((acc, p) => acc + p.totalFlow, 0) / nightPoints.length
        : 0;
    const avgLegit =
      nightPoints.length > 0
        ? nightPoints.reduce((acc, p) => acc + p.legitimateUsage, 0) / nightPoints.length
        : 0;
    const avgTank =
      nightPoints.length > 0
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
      sampleCount: evalResult.sampleCount,
      coverageRatio: evalResult.coverageRatio,
      status: evalResult.status,
      sourceDateAzt: localDateKey,
      isPersisted: false,
    };
  }, [hourlyData, profile.baselineMnf, activeClock, clockTick, persistedNightFlow]);

  return {
    hourlyData,
    mnfStats,
    dmaProfile: profile,
  };
}
