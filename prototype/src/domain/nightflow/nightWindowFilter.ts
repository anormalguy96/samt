/**
 * Nocturnal Minimum Night Flow (MNF) Analysis (Lectures 1, 3, & 5)
 * Evaluates flow observations strictly within the canonical Asia/Baku [02:00, 04:00) window.
 *
 * SAMT v1.1.0 Hardening:
 * - Safe UTC+4 conversion around midnight (no negative modulo errors).
 * - Explicit minimum sample & temporal coverage requirement before flagging anomalies.
 * - Explicit anomaly threshold reported in result.
 * - Explicitly labeled as a synthetic 5th-percentile heuristic (does NOT prove
 *   physical tank-refill separation or exact underground pipe localization).
 */

import type { FlowSample } from '../balance/flowIntegration.js';

export interface NightWindowConfig {
  startHour: number; // 2 (02:00)
  endHour: number; // 4 (04:00) - half-open [startHour, endHour)
  timezoneOffsetHours: number; // +4 for Asia/Baku (AZT, no DST since 2016)
  minRequiredSamples?: number; // Default: 2 for coarse hourly/unit fixtures; server uses 8+
  minRequiredCoverageRatio?: number; // Default: 0.0 unless window span check requested
  minExcessM3h?: number; // Default: 12 m³/h
  minExcessFractionOfBaseline?: number; // Default: 0.25 (25% above baseline)
}

export const DEFAULT_BAKU_NIGHT_WINDOW: NightWindowConfig = {
  startHour: 2,
  endHour: 4,
  timezoneOffsetHours: 4,
  minRequiredSamples: 2,
  minRequiredCoverageRatio: 0,
  minExcessM3h: 12,
  minExcessFractionOfBaseline: 0.25,
};

export const OPERATIONAL_BAKU_NIGHT_WINDOW: NightWindowConfig = {
  startHour: 2,
  endHour: 4,
  timezoneOffsetHours: 4,
  minRequiredSamples: 8,
  minRequiredCoverageRatio: 0.5,
  minExcessM3h: 12,
  minExcessFractionOfBaseline: 0.25,
};

export type MnfStatus = 'INSUFFICIENT_COVERAGE' | 'NOMINAL' | 'ANOMALY_DETECTED';

export interface MnfEvaluationResult {
  status: MnfStatus;
  isWithinNightWindow: boolean;
  sampleCount: number;
  coverageRatio: number;
  minFlowM3h: number;
  averageNightFlowM3h: number;
  percentile5FlowM3h: number;
  historicalBaselineMnfM3h: number;
  anomalyThresholdM3h: number;
  excessNightFlowM3h: number;
  isAnomalyDetected: boolean;
  anomalyConfidence: number;
  detectionReason: string;
  methodologyNote: string;
}

const MS_PER_HOUR = 3600 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Formats a Date into Asia/Baku (or configured offset) YYYY-MM-DD calendar date safely across midnight.
 */
export function getLocalDateKey(
  date: Date,
  timezoneOffsetHours: number = DEFAULT_BAKU_NIGHT_WINDOW.timezoneOffsetHours
): string {
  const shifted = new Date(date.getTime() + timezoneOffsetHours * MS_PER_HOUR);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns exact UTC [windowStart, windowEnd) bounds for a local Asia/Baku calendar date (YYYY-MM-DD).
 */
export function getNightWindowBoundsUtc(
  localDateYmd: string,
  config: Pick<NightWindowConfig, 'startHour' | 'endHour' | 'timezoneOffsetHours'> = DEFAULT_BAKU_NIGHT_WINDOW
): { windowStart: Date; windowEnd: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDateYmd);
  if (!match) {
    throw new Error(`Invalid local date format '${localDateYmd}'; expected YYYY-MM-DD`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const offsetMs = config.timezoneOffsetHours * MS_PER_HOUR;
  const midnightLocalAsUtcMs = Date.UTC(year, month, day, 0, 0, 0, 0);
  const windowStart = new Date(midnightLocalAsUtcMs + config.startHour * MS_PER_HOUR - offsetMs);
  const windowEnd = new Date(midnightLocalAsUtcMs + config.endHour * MS_PER_HOUR - offsetMs);
  return { windowStart, windowEnd };
}

/**
 * Returns local fractional hour in [0, 24) safely handling UTC day wraparound.
 */
export function getLocalHourDecimal(
  date: Date,
  timezoneOffsetHours: number = DEFAULT_BAKU_NIGHT_WINDOW.timezoneOffsetHours
): number {
  const shiftedMs = date.getTime() + timezoneOffsetHours * MS_PER_HOUR;
  const msWithinDay = ((shiftedMs % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
  return msWithinDay / MS_PER_HOUR;
}

/**
 * Checks whether a timestamp falls inside [startHour, endHour) in the configured timezone.
 */
export function isInsideNightWindow(
  date: Date,
  config: NightWindowConfig = DEFAULT_BAKU_NIGHT_WINDOW
): boolean {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return false;
  }
  const localHoursDecimal = getLocalHourDecimal(date, config.timezoneOffsetHours);
  return localHoursDecimal >= config.startHour && localHoursDecimal < config.endHour;
}

/**
 * Evaluates nocturnal flow samples against a dry-weather historical baseline.
 */
export function evaluateMinimumNightFlow(
  samples: FlowSample[],
  historicalBaselineMnfM3h: number,
  config: NightWindowConfig = DEFAULT_BAKU_NIGHT_WINDOW
): MnfEvaluationResult {
  const methodologyNote =
    'Synthetic 5th-percentile nocturnal flow heuristic over [02:00, 04:00) AZT; does not by itself prove physical rooftop-tank separation or exact underground pipe localization.';

  if (!Number.isFinite(historicalBaselineMnfM3h) || historicalBaselineMnfM3h < 0) {
    throw new Error(`Invalid historicalBaselineMnfM3h: ${historicalBaselineMnfM3h}`);
  }

  const minSamples = config.minRequiredSamples ?? 2;
  const minCoverage = config.minRequiredCoverageRatio ?? 0;
  const thresholdM3h = Math.max(
    config.minExcessM3h ?? 12,
    historicalBaselineMnfM3h * (config.minExcessFractionOfBaseline ?? 0.25)
  );

  const nightSamples = samples
    .filter(
      (s) =>
        s &&
        s.timestamp instanceof Date &&
        Number.isFinite(s.timestamp.getTime()) &&
        Number.isFinite(s.flowM3h) &&
        s.flowM3h >= 0 &&
        isInsideNightWindow(s.timestamp, config)
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (nightSamples.length === 0) {
    return {
      status: 'INSUFFICIENT_COVERAGE',
      isWithinNightWindow: false,
      sampleCount: 0,
      coverageRatio: 0,
      minFlowM3h: 0,
      averageNightFlowM3h: 0,
      percentile5FlowM3h: 0,
      historicalBaselineMnfM3h,
      anomalyThresholdM3h: parseFloat(thresholdM3h.toFixed(2)),
      excessNightFlowM3h: 0,
      isAnomalyDetected: false,
      anomalyConfidence: 0,
      detectionReason: 'No valid telemetry samples available within [02:00, 04:00) AZT window',
      methodologyNote,
    };
  }

  // Compute temporal span coverage inside the 2-hour night window (or single-date span)
  const nightWindowDurationMs = Math.max(1, (config.endHour - config.startHour) * MS_PER_HOUR);
  const firstMs = nightSamples[0].timestamp.getTime();
  const lastMs = nightSamples[nightSamples.length - 1].timestamp.getTime();
  const spanMs = Math.min(nightWindowDurationMs, Math.max(0, lastMs - firstMs));
  // If samples are densely spaced across the 2h window, coverageRatio approaches 1.0
  const coverageRatio = parseFloat(Math.min(1.0, spanMs / nightWindowDurationMs).toFixed(4));

  const flows = nightSamples.map((s) => s.flowM3h).sort((a, b) => a - b);
  const minFlowM3h = flows[0];
  const avgFlow = flows.reduce((acc, v) => acc + v, 0) / flows.length;
  const p5Index = Math.max(0, Math.floor((flows.length - 1) * 0.05));
  const p5FlowM3h = flows[p5Index];
  const excessNightFlowM3h = Math.max(0, p5FlowM3h - historicalBaselineMnfM3h);

  if (nightSamples.length < minSamples || coverageRatio < minCoverage) {
    return {
      status: 'INSUFFICIENT_COVERAGE',
      isWithinNightWindow: true,
      sampleCount: nightSamples.length,
      coverageRatio,
      minFlowM3h: parseFloat(minFlowM3h.toFixed(2)),
      averageNightFlowM3h: parseFloat(avgFlow.toFixed(2)),
      percentile5FlowM3h: parseFloat(p5FlowM3h.toFixed(2)),
      historicalBaselineMnfM3h,
      anomalyThresholdM3h: parseFloat(thresholdM3h.toFixed(2)),
      excessNightFlowM3h: parseFloat(excessNightFlowM3h.toFixed(2)),
      isAnomalyDetected: false,
      anomalyConfidence: 0,
      detectionReason: `Insufficient nocturnal coverage for anomaly decision (samples=${nightSamples.length}/${minSamples}, span_coverage=${(coverageRatio * 100).toFixed(1)}%/${(minCoverage * 100).toFixed(0)}%)`,
      methodologyNote,
    };
  }

  const isAnomalyDetected = excessNightFlowM3h > thresholdM3h;
  const denom = Math.max(1, historicalBaselineMnfM3h);
  const anomalyConfidence = isAnomalyDetected
    ? Math.min(0.99, 0.65 + (excessNightFlowM3h / denom) * 0.3)
    : 0;

  const detectionReason = isAnomalyDetected
    ? `Nocturnal flow anomaly: 5th-percentile flow (${p5FlowM3h.toFixed(1)} m³/h) exceeds baseline (${historicalBaselineMnfM3h.toFixed(1)} m³/h) by +${excessNightFlowM3h.toFixed(1)} m³/h (> ${thresholdM3h.toFixed(1)} m³/h threshold)`
    : `Nominal nocturnal flow: 5th-percentile (${p5FlowM3h.toFixed(1)} m³/h) within baseline envelope (+${excessNightFlowM3h.toFixed(1)} <= ${thresholdM3h.toFixed(1)} m³/h threshold)`;

  return {
    status: isAnomalyDetected ? 'ANOMALY_DETECTED' : 'NOMINAL',
    isWithinNightWindow: true,
    sampleCount: nightSamples.length,
    coverageRatio,
    minFlowM3h: parseFloat(minFlowM3h.toFixed(2)),
    averageNightFlowM3h: parseFloat(avgFlow.toFixed(2)),
    percentile5FlowM3h: parseFloat(p5FlowM3h.toFixed(2)),
    historicalBaselineMnfM3h,
    anomalyThresholdM3h: parseFloat(thresholdM3h.toFixed(2)),
    excessNightFlowM3h: parseFloat(excessNightFlowM3h.toFixed(2)),
    isAnomalyDetected,
    anomalyConfidence: parseFloat(anomalyConfidence.toFixed(2)),
    detectionReason,
    methodologyNote,
  };
}
