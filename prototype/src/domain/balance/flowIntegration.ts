/**
 * Flow Volume Integration & Coverage Analytics (Lecture 3 & Domain Hydraulics)
 * Implements trapezoidal Riemann sum integration over actual elapsed time intervals.
 * 
 * Regressed Bug Fixed:
 * The old SQL `SUM(value * 0.25)` over 60 fifteen-second samples returned 1,500 m³ for
 * a constant 100 m³/h flow over 15 minutes. The true physical volume is exactly 25 m³.
 */

export interface FlowSample {
  timestamp: Date;
  flowM3h: number;
}

export interface IntegrationWindow {
  windowStart: Date;
  windowEnd: Date;
  expectedSampleIntervalSec?: number; // e.g., 15s or 60s
}

export interface VolumeIntegrationResult {
  totalVolumeM3: number;
  sampleCount: number;
  effectiveDurationHours: number;
  averageFlowM3h: number;
  coverageRatio: number; // 0.0 to 1.0 (1.0 = 100% complete temporal coverage)
  isCompleteCoverage: boolean;
  maxGapSeconds: number;
  uncertaintyEstimateM3: number;
}

/**
 * Integrates flow rate time series (m³/h) into volume (m³) using trapezoidal time-interval integration.
 */
export function integrateFlowVolume(
  samples: FlowSample[],
  window?: IntegrationWindow
): VolumeIntegrationResult {
  if (samples.length === 0) {
    return {
      totalVolumeM3: 0,
      sampleCount: 0,
      effectiveDurationHours: 0,
      averageFlowM3h: 0,
      coverageRatio: 0,
      isCompleteCoverage: false,
      maxGapSeconds: 0,
      uncertaintyEstimateM3: 0,
    };
  }

  // Sort chronologically
  const sorted = [...samples].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  const startMs = window ? window.windowStart.getTime() : sorted[0].timestamp.getTime();
  const endMs = window ? window.windowEnd.getTime() : sorted[sorted.length - 1].timestamp.getTime();
  const totalWindowMs = Math.max(1000, endMs - startMs);

  // If only 1 sample exists, assume constant flow over the window if defined, or zero duration
  if (sorted.length === 1) {
    const durationHours = totalWindowMs / (3600 * 1000);
    const vol = sorted[0].flowM3h * durationHours;
    return {
      totalVolumeM3: parseFloat(vol.toFixed(4)),
      sampleCount: 1,
      effectiveDurationHours: durationHours,
      averageFlowM3h: sorted[0].flowM3h,
      coverageRatio: window ? 0.2 : 1.0,
      isCompleteCoverage: false,
      maxGapSeconds: totalWindowMs / 1000,
      uncertaintyEstimateM3: vol * 0.15,
    };
  }

  let totalVolumeM3 = 0;
  let maxGapMs = 0;
  let measuredDurationMs = 0;

  // Trapezoidal integration across sequential intervals
  for (let i = 0; i < sorted.length - 1; i++) {
    const t1 = sorted[i].timestamp.getTime();
    const t2 = sorted[i + 1].timestamp.getTime();
    const dtMs = t2 - t1;

    if (dtMs <= 0) continue; // Skip identical timestamps

    if (dtMs > maxGapMs) {
      maxGapMs = dtMs;
    }

    measuredDurationMs += dtMs;
    const dtHours = dtMs / (3600 * 1000);
    const avgFlow = (sorted[i].flowM3h + sorted[i + 1].flowM3h) / 2;
    totalVolumeM3 += avgFlow * dtHours;
  }

  // If window bounds extend beyond first/last sample within tolerance, extend with nearest boundary
  const firstSampleMs = sorted[0].timestamp.getTime();
  const lastSampleMs = sorted[sorted.length - 1].timestamp.getTime();

  if (window) {
    // Leading boundary extension
    if (firstSampleMs > startMs) {
      const leadGap = firstSampleMs - startMs;
      maxGapMs = Math.max(maxGapMs, leadGap);
      const leadDtHours = leadGap / (3600 * 1000);
      totalVolumeM3 += sorted[0].flowM3h * leadDtHours;
      measuredDurationMs += leadGap;
    }
    // Trailing boundary extension
    if (endMs > lastSampleMs) {
      const trailGap = endMs - lastSampleMs;
      maxGapMs = Math.max(maxGapMs, trailGap);
      const trailDtHours = trailGap / (3600 * 1000);
      totalVolumeM3 += sorted[sorted.length - 1].flowM3h * trailDtHours;
      measuredDurationMs += trailGap;
    }
  }

  const durationHours = totalWindowMs / (3600 * 1000);
  const coverageRatio = Math.min(1.0, measuredDurationMs / totalWindowMs);
  const averageFlowM3h = durationHours > 0 ? totalVolumeM3 / durationHours : 0;
  const isCompleteCoverage = coverageRatio >= 0.95 && maxGapMs <= (window?.expectedSampleIntervalSec ? window.expectedSampleIntervalSec * 4 * 1000 : 120 * 1000);

  // Uncertainty estimate: gap penalty + flow variance factor
  const gapPenalty = (1.0 - coverageRatio) * totalVolumeM3;
  const uncertainty = gapPenalty * 0.5 + totalVolumeM3 * 0.02;

  return {
    totalVolumeM3: parseFloat(totalVolumeM3.toFixed(4)),
    sampleCount: sorted.length,
    effectiveDurationHours: durationHours,
    averageFlowM3h: parseFloat(averageFlowM3h.toFixed(3)),
    coverageRatio: parseFloat(coverageRatio.toFixed(3)),
    isCompleteCoverage,
    maxGapSeconds: maxGapMs / 1000,
    uncertaintyEstimateM3: parseFloat(uncertainty.toFixed(4)),
  };
}
