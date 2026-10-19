/**
 * Nocturnal Minimum Night Flow (MNF) Analysis (Lecture 1, 3, & 5)
 * Defines the canonical Asia/Baku [02:00, 04:00) window.
 * Evaluates real flow observations to detect anomalies without cheating on generator labels.
 */

import type { FlowSample } from '../balance/flowIntegration';

export interface NightWindowConfig {
  startHour: number; // 2 (02:00)
  endHour: number;   // 4 (04:00) - window is [startHour, endHour)
  timezoneOffsetHours: number; // +4 for Asia/Baku (AZT)
}

export const DEFAULT_BAKU_NIGHT_WINDOW: NightWindowConfig = {
  startHour: 2,
  endHour: 4,
  timezoneOffsetHours: 4,
};

export interface MnfEvaluationResult {
  isWithinNightWindow: boolean;
  sampleCount: number;
  minFlowM3h: number;
  averageNightFlowM3h: number;
  percentile5FlowM3h: number;
  historicalBaselineMnfM3h: number;
  excessNightFlowM3h: number; // Measured MNF - Baseline MNF
  isAnomalyDetected: boolean;
  anomalyConfidence: number;
  detectionReason: string;
}

/**
 * Checks whether a given timestamp is inside the [02:00, 04:00) Asia/Baku night window.
 */
export function isInsideNightWindow(
  date: Date,
  config: NightWindowConfig = DEFAULT_BAKU_NIGHT_WINDOW
): boolean {
  // Convert UTC to local hours
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  const localMinutesTotal = (utcHours * 60 + utcMinutes + config.timezoneOffsetHours * 60) % (24 * 60);
  const localHoursDecimal = localMinutesTotal / 60;

  return localHoursDecimal >= config.startHour && localHoursDecimal < config.endHour;
}

/**
 * Evaluates nocturnal flow samples against a historical baseline.
 * The detector only receives raw flow samples and a baseline reference;
 * it NEVER receives or subtracts synthetic generator labels directly.
 */
export function evaluateMinimumNightFlow(
  samples: FlowSample[],
  historicalBaselineMnfM3h: number,
  config: NightWindowConfig = DEFAULT_BAKU_NIGHT_WINDOW
): MnfEvaluationResult {
  // Filter samples falling strictly inside [02:00, 04:00)
  const nightSamples = samples.filter((s) => isInsideNightWindow(s.timestamp, config));

  if (nightSamples.length === 0) {
    return {
      isWithinNightWindow: false,
      sampleCount: 0,
      minFlowM3h: 0,
      averageNightFlowM3h: 0,
      percentile5FlowM3h: 0,
      historicalBaselineMnfM3h,
      excessNightFlowM3h: 0,
      isAnomalyDetected: false,
      anomalyConfidence: 0,
      detectionReason: 'No telemetry samples available within [02:00, 04:00) AZT window',
    };
  }

  const flows = nightSamples.map((s) => s.flowM3h).sort((a, b) => a - b);
  const minFlowM3h = flows[0];
  const sum = flows.reduce((acc, v) => acc + v, 0);
  const avgFlow = sum / flows.length;

  // 5th percentile calculation
  const p5Index = Math.max(0, Math.floor(flows.length * 0.05));
  const p5FlowM3h = flows[p5Index];

  // Excess night flow above known dry-weather baseline
  const excessNightFlowM3h = Math.max(0, p5FlowM3h - historicalBaselineMnfM3h);

  // Anomaly trigger: excess flow > 15 m³/h or > 30% above baseline
  const baselineThreshold = Math.max(12, historicalBaselineMnfM3h * 0.25);
  const isAnomalyDetected = excessNightFlowM3h > baselineThreshold;
  const anomalyConfidence = isAnomalyDetected 
    ? Math.min(0.99, 0.65 + (excessNightFlowM3h / historicalBaselineMnfM3h) * 0.3)
    : 0;

  const detectionReason = isAnomalyDetected
    ? `Nocturnal flow anomaly: 5th-percentile flow (${p5FlowM3h.toFixed(1)} m³/h) exceeds baseline (${historicalBaselineMnfM3h.toFixed(1)} m³/h) by +${excessNightFlowM3h.toFixed(1)} m³/h (> ${baselineThreshold.toFixed(1)} m³/h threshold)`
    : `Nominal nocturnal flow: 5th-percentile (${p5FlowM3h.toFixed(1)} m³/h) within baseline envelope`;

  return {
    isWithinNightWindow: true,
    sampleCount: nightSamples.length,
    minFlowM3h: parseFloat(minFlowM3h.toFixed(2)),
    averageNightFlowM3h: parseFloat(avgFlow.toFixed(2)),
    percentile5FlowM3h: parseFloat(p5FlowM3h.toFixed(2)),
    historicalBaselineMnfM3h,
    excessNightFlowM3h: parseFloat(excessNightFlowM3h.toFixed(2)),
    isAnomalyDetected,
    anomalyConfidence: parseFloat(anomalyConfidence.toFixed(2)),
    detectionReason,
  };
}
