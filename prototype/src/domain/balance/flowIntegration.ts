/**
 * Flow Volume Integration & Coverage Analytics (Lecture 3 & Domain Hydraulics)
 * Implements clipped trapezoidal Riemann integration over valid elapsed intervals.
 *
 * Policies (SAMT v1.1.0):
 * 1. Window Clipping: Integration is strictly bounded to [windowStart, windowEnd].
 *    Bracketing samples across a boundary are linearly interpolated ONLY if the
 *    spanning interval <= maxGapSec; distant outside samples are discarded.
 * 2. Gap Bounding: Interior intervals with dt > maxGapSec are treated as unmeasured
 *    gaps and excluded from both measuredDuration and measuredVolumeM3.
 * 3. Bounded Boundary Hold: Under boundaryPolicy = 'BOUNDED_HOLD' (default), a
 *    leading or trailing gap <= expectedSampleIntervalSec is added as
 *    estimatedBoundaryVolumeM3 (kept separate from measuredVolumeM3 and never
 *    counted toward measured coverageRatio). Under 'STRICT_INTERIOR', no edge
 *    hold is added (e.g., 60 samples at 15s spacing span 14m45s = 24.5833 m³;
 *    61 endpoint samples span full 15m00s = 25.0000 m³).
 * 4. Duplicate Timestamps: Identical valid timestamps are deterministically averaged
 *    and reported via duplicateTimestampCount.
 * 5. Single Sample / Malformed Input: Never fabricates duration for a single point;
 *    invalid dates or non-finite/negative readings produce explicit counts/status.
 */

export interface FlowSample {
  timestamp: Date;
  flowM3h: number;
}

export type BoundaryPolicy = 'BOUNDED_HOLD' | 'STRICT_INTERIOR';

export interface IntegrationWindow {
  windowStart: Date;
  windowEnd: Date;
  expectedSampleIntervalSec?: number;
  maxGapSec?: number;
  boundaryPolicy?: BoundaryPolicy;
}

export type IntegrationStatus =
  | 'COMPLETE'
  | 'PARTIAL_COVERAGE'
  | 'INSUFFICIENT_COVERAGE'
  | 'INVALID_INPUT';

export interface VolumeIntegrationResult {
  status: IntegrationStatus;
  totalVolumeM3: number;
  measuredVolumeM3: number;
  estimatedBoundaryVolumeM3: number;
  sampleCount: number;
  inWindowSampleCount: number;
  invalidSampleCount: number;
  outOfWindowSampleCount: number;
  duplicateTimestampCount: number;
  windowDurationHours: number;
  effectiveDurationHours: number;
  measuredDurationHours: number;
  averageFlowM3h: number;
  coverageRatio: number; // Strictly measuredDuration / windowDuration (0.0 to 1.0)
  isCompleteCoverage: boolean;
  maxGapSeconds: number;
  unmeasuredGapSeconds: number;
  uncertaintyEstimateM3: number;
  boundaryPolicyApplied: BoundaryPolicy;
  warnings: string[];
}

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && Number.isFinite(d.getTime());
}

function emptyResult(
  status: IntegrationStatus,
  boundaryPolicy: BoundaryPolicy,
  windowDurationHours: number,
  warnings: string[],
  counts?: {
    sampleCount?: number;
    inWindowSampleCount?: number;
    invalidSampleCount?: number;
    outOfWindowSampleCount?: number;
    duplicateTimestampCount?: number;
    maxGapSeconds?: number;
  }
): VolumeIntegrationResult {
  return {
    status,
    totalVolumeM3: 0,
    measuredVolumeM3: 0,
    estimatedBoundaryVolumeM3: 0,
    sampleCount: counts?.sampleCount ?? 0,
    inWindowSampleCount: counts?.inWindowSampleCount ?? 0,
    invalidSampleCount: counts?.invalidSampleCount ?? 0,
    outOfWindowSampleCount: counts?.outOfWindowSampleCount ?? 0,
    duplicateTimestampCount: counts?.duplicateTimestampCount ?? 0,
    windowDurationHours: parseFloat(windowDurationHours.toFixed(6)),
    effectiveDurationHours: 0,
    measuredDurationHours: 0,
    averageFlowM3h: 0,
    coverageRatio: 0,
    isCompleteCoverage: false,
    maxGapSeconds: counts?.maxGapSeconds ?? 0,
    unmeasuredGapSeconds: parseFloat((windowDurationHours * 3600).toFixed(3)),
    uncertaintyEstimateM3: 0,
    boundaryPolicyApplied: boundaryPolicy,
    warnings,
  };
}

/**
 * Integrates a single meter's flow rate time series (m³/h) into volume (m³).
 */
export function integrateFlowVolume(
  samples: FlowSample[],
  window?: IntegrationWindow
): VolumeIntegrationResult {
  const boundaryPolicy: BoundaryPolicy = window?.boundaryPolicy ?? 'BOUNDED_HOLD';
  const warnings: string[] = [];

  if (window) {
    if (!isValidDate(window.windowStart) || !isValidDate(window.windowEnd)) {
      return emptyResult('INVALID_INPUT', boundaryPolicy, 0, [
        'Integration window has invalid start or end Date',
      ]);
    }
    if (window.windowEnd.getTime() <= window.windowStart.getTime()) {
      return emptyResult('INVALID_INPUT', boundaryPolicy, 0, [
        'Integration windowEnd must be strictly after windowStart',
      ]);
    }
    if (
      window.expectedSampleIntervalSec !== undefined &&
      (!Number.isFinite(window.expectedSampleIntervalSec) || window.expectedSampleIntervalSec <= 0)
    ) {
      return emptyResult('INVALID_INPUT', boundaryPolicy, 0, [
        'expectedSampleIntervalSec must be a positive finite number',
      ]);
    }
  }

  // Separate valid vs malformed samples
  const validRaw: { ms: number; flowM3h: number }[] = [];
  let invalidSampleCount = 0;
  for (const s of samples) {
    if (!s || !isValidDate(s.timestamp) || !Number.isFinite(s.flowM3h) || s.flowM3h < 0) {
      invalidSampleCount++;
      continue;
    }
    validRaw.push({ ms: s.timestamp.getTime(), flowM3h: s.flowM3h });
  }

  if (invalidSampleCount > 0) {
    warnings.push(`Excluded ${invalidSampleCount} sample(s) with invalid timestamp or non-finite/negative flow`);
  }

  const windowDurationHours = window
    ? (window.windowEnd.getTime() - window.windowStart.getTime()) / (3600 * 1000)
    : 0;

  if (validRaw.length === 0) {
    return emptyResult(
      invalidSampleCount > 0 ? 'INVALID_INPUT' : 'INSUFFICIENT_COVERAGE',
      boundaryPolicy,
      windowDurationHours,
      warnings.length > 0 ? warnings : ['No valid samples provided'],
      { invalidSampleCount, maxGapSeconds: windowDurationHours * 3600 }
    );
  }

  // Sort chronologically and collapse duplicate timestamps deterministically by arithmetic mean
  validRaw.sort((a, b) => a.ms - b.ms);
  const collapsed: { ms: number; flowM3h: number }[] = [];
  let duplicateTimestampCount = 0;

  let idx = 0;
  while (idx < validRaw.length) {
    let sum = validRaw[idx].flowM3h;
    let count = 1;
    while (idx + count < validRaw.length && validRaw[idx + count].ms === validRaw[idx].ms) {
      sum += validRaw[idx + count].flowM3h;
      count++;
    }
    if (count > 1) {
      duplicateTimestampCount += count - 1;
    }
    collapsed.push({ ms: validRaw[idx].ms, flowM3h: sum / count });
    idx += count;
  }

  if (duplicateTimestampCount > 0) {
    warnings.push(`Averaged ${duplicateTimestampCount} duplicate timestamp sample(s)`);
  }

  const startMs = window ? window.windowStart.getTime() : collapsed[0].ms;
  const endMs = window ? window.windowEnd.getTime() : collapsed[collapsed.length - 1].ms;
  const totalWindowMs = endMs - startMs;

  if (totalWindowMs <= 0) {
    warnings.push('Single timestamp cannot establish an integration interval; duration is not fabricated');
    return emptyResult('INSUFFICIENT_COVERAGE', boundaryPolicy, 0, warnings, {
      sampleCount: collapsed.length,
      inWindowSampleCount: collapsed.length,
      invalidSampleCount,
      duplicateTimestampCount,
    });
  }

  const expectedIntervalSec = window?.expectedSampleIntervalSec;
  const maxGapSec =
    window?.maxGapSec ??
    (expectedIntervalSec !== undefined ? Math.max(expectedIntervalSec * 5, 60) : 900);
  const maxGapMs = maxGapSec * 1000;
  const boundaryHoldMaxMs =
    boundaryPolicy === 'BOUNDED_HOLD' && expectedIntervalSec !== undefined
      ? expectedIntervalSec * 1000
      : 0;

  // Clip samples strictly to [startMs, endMs], interpolating across window boundaries only when gap <= maxGapMs
  const inWindow: { ms: number; flowM3h: number }[] = [];
  let outOfWindowSampleCount = 0;

  let lastBefore: { ms: number; flowM3h: number } | undefined;
  let firstAfter: { ms: number; flowM3h: number } | undefined;

  for (const pt of collapsed) {
    if (pt.ms < startMs) {
      lastBefore = pt;
      outOfWindowSampleCount++;
    } else if (pt.ms > endMs) {
      if (!firstAfter) firstAfter = pt;
      outOfWindowSampleCount++;
    } else {
      inWindow.push(pt);
    }
  }

  const clippedPoints: { ms: number; flowM3h: number }[] = [];

  // Interpolate start boundary if bracketed within maxGapMs
  if (lastBefore) {
    const nextPt = inWindow[0] ?? firstAfter;
    if (nextPt && nextPt.ms > startMs && nextPt.ms - lastBefore.ms <= maxGapMs) {
      const ratio = (startMs - lastBefore.ms) / (nextPt.ms - lastBefore.ms);
      const interpFlow = lastBefore.flowM3h + ratio * (nextPt.flowM3h - lastBefore.flowM3h);
      if (!inWindow[0] || inWindow[0].ms > startMs) {
        clippedPoints.push({ ms: startMs, flowM3h: interpFlow });
      }
    }
  }

  for (const pt of inWindow) {
    clippedPoints.push(pt);
  }

  // Interpolate end boundary if bracketed within maxGapMs
  if (firstAfter) {
    const prevPt = inWindow[inWindow.length - 1] ?? lastBefore;
    if (prevPt && prevPt.ms < endMs && firstAfter.ms - prevPt.ms <= maxGapMs) {
      const ratio = (endMs - prevPt.ms) / (firstAfter.ms - prevPt.ms);
      const interpFlow = prevPt.flowM3h + ratio * (firstAfter.flowM3h - prevPt.flowM3h);
      const lastClipped = clippedPoints[clippedPoints.length - 1];
      if (!lastClipped || lastClipped.ms < endMs) {
        clippedPoints.push({ ms: endMs, flowM3h: interpFlow });
      }
    }
  }

  const totalWindowHours = totalWindowMs / (3600 * 1000);

  if (clippedPoints.length === 0) {
    warnings.push('No valid samples fall within the requested integration window');
    return emptyResult('INSUFFICIENT_COVERAGE', boundaryPolicy, totalWindowHours, warnings, {
      sampleCount: collapsed.length,
      inWindowSampleCount: 0,
      invalidSampleCount,
      outOfWindowSampleCount,
      duplicateTimestampCount,
      maxGapSeconds: totalWindowMs / 1000,
    });
  }

  if (clippedPoints.length === 1) {
    warnings.push('Single sample in window cannot establish an integration interval; duration is not fabricated');
    return emptyResult('INSUFFICIENT_COVERAGE', boundaryPolicy, totalWindowHours, warnings, {
      sampleCount: collapsed.length,
      inWindowSampleCount: inWindow.length,
      invalidSampleCount,
      outOfWindowSampleCount,
      duplicateTimestampCount,
      maxGapSeconds: totalWindowMs / 1000,
    });
  }

  let measuredVolumeM3 = 0;
  let estimatedBoundaryVolumeM3 = 0;
  let measuredDurationMs = 0;
  let estimatedBoundaryDurationMs = 0;
  let maxGapObservedMs = 0;
  let unmeasuredGapMs = 0;

  // Interior trapezoidal integration bounded by maxGapMs
  for (let i = 0; i < clippedPoints.length - 1; i++) {
    const p1 = clippedPoints[i];
    const p2 = clippedPoints[i + 1];
    const dtMs = p2.ms - p1.ms;
    if (dtMs <= 0) continue;

    if (dtMs > maxGapObservedMs) {
      maxGapObservedMs = dtMs;
    }

    if (dtMs > maxGapMs) {
      unmeasuredGapMs += dtMs;
      warnings.push(`Excluded unmeasured interior gap of ${(dtMs / 1000).toFixed(1)}s (> ${maxGapSec}s limit)`);
      continue;
    }

    measuredDurationMs += dtMs;
    const dtHours = dtMs / (3600 * 1000);
    measuredVolumeM3 += ((p1.flowM3h + p2.flowM3h) / 2) * dtHours;
  }

  // Leading and trailing boundary gaps (strictly bounded hold, never counted as measured coverage)
  const firstClipped = clippedPoints[0];
  const lastClipped = clippedPoints[clippedPoints.length - 1];

  const leadGapMs = Math.max(0, firstClipped.ms - startMs);
  if (leadGapMs > 0) {
    maxGapObservedMs = Math.max(maxGapObservedMs, leadGapMs);
    if (boundaryHoldMaxMs > 0 && leadGapMs <= boundaryHoldMaxMs) {
      estimatedBoundaryDurationMs += leadGapMs;
      estimatedBoundaryVolumeM3 += firstClipped.flowM3h * (leadGapMs / (3600 * 1000));
    } else {
      unmeasuredGapMs += leadGapMs;
    }
  }

  const trailGapMs = Math.max(0, endMs - lastClipped.ms);
  if (trailGapMs > 0) {
    maxGapObservedMs = Math.max(maxGapObservedMs, trailGapMs);
    if (boundaryHoldMaxMs > 0 && trailGapMs <= boundaryHoldMaxMs) {
      estimatedBoundaryDurationMs += trailGapMs;
      estimatedBoundaryVolumeM3 += lastClipped.flowM3h * (trailGapMs / (3600 * 1000));
    } else {
      unmeasuredGapMs += trailGapMs;
    }
  }

  const totalVolumeM3 = measuredVolumeM3 + estimatedBoundaryVolumeM3;
  const measuredDurationHours = measuredDurationMs / (3600 * 1000);
  const effectiveDurationHours = (measuredDurationMs + estimatedBoundaryDurationMs) / (3600 * 1000);
  const coverageRatio = Math.min(1.0, Math.max(0.0, measuredDurationMs / totalWindowMs));
  const averageFlowM3h = effectiveDurationHours > 0 ? totalVolumeM3 / effectiveDurationHours : 0;

  const isCompleteCoverage = coverageRatio >= 0.95 && unmeasuredGapMs === 0 && maxGapObservedMs <= maxGapMs;

  let status: IntegrationStatus = 'COMPLETE';
  if (!isCompleteCoverage) {
    status = coverageRatio >= 0.7 ? 'PARTIAL_COVERAGE' : 'INSUFFICIENT_COVERAGE';
  }

  // Uncertainty increases with missing coverage and boundary estimation
  const missingFraction = 1.0 - coverageRatio;
  const uncertainty =
    measuredVolumeM3 * 0.02 +
    estimatedBoundaryVolumeM3 * 0.1 +
    (effectiveDurationHours > 0 ? averageFlowM3h * (unmeasuredGapMs / (3600 * 1000)) * 0.5 : 0) +
    missingFraction * totalVolumeM3 * 0.15;

  return {
    status,
    totalVolumeM3: parseFloat(totalVolumeM3.toFixed(4)),
    measuredVolumeM3: parseFloat(measuredVolumeM3.toFixed(4)),
    estimatedBoundaryVolumeM3: parseFloat(estimatedBoundaryVolumeM3.toFixed(4)),
    sampleCount: collapsed.length,
    inWindowSampleCount: inWindow.length,
    invalidSampleCount,
    outOfWindowSampleCount,
    duplicateTimestampCount,
    windowDurationHours: parseFloat(totalWindowHours.toFixed(6)),
    effectiveDurationHours: parseFloat(effectiveDurationHours.toFixed(6)),
    measuredDurationHours: parseFloat(measuredDurationHours.toFixed(6)),
    averageFlowM3h: parseFloat(averageFlowM3h.toFixed(3)),
    coverageRatio: parseFloat(coverageRatio.toFixed(4)),
    isCompleteCoverage,
    maxGapSeconds: parseFloat((maxGapObservedMs / 1000).toFixed(3)),
    unmeasuredGapSeconds: parseFloat((unmeasuredGapMs / 1000).toFixed(3)),
    uncertaintyEstimateM3: parseFloat(uncertainty.toFixed(4)),
    boundaryPolicyApplied: boundaryPolicy,
    warnings,
  };
}

export interface PerMeterIntegrationSummary {
  meterId: string;
  result: VolumeIntegrationResult;
}

/**
 * Integrates each meter independently and sums total/measured volumes across meters.
 * Fixes cross-meter averaging bugs where AVG(inlet_flows) * 0.25 undercounted multi-inlet DMAs.
 */
export function integrateMultipleMeters(
  samplesByMeter: Map<string, FlowSample[]>,
  window: IntegrationWindow
): {
  perMeter: PerMeterIntegrationSummary[];
  totalVolumeM3: number;
  measuredVolumeM3: number;
  estimatedBoundaryVolumeM3: number;
  meanCoverageRatio: number;
} {
  const perMeter: PerMeterIntegrationSummary[] = [];
  for (const [meterId, meterSamples] of samplesByMeter.entries()) {
    perMeter.push({
      meterId,
      result: integrateFlowVolume(meterSamples, window),
    });
  }
  const totalVolumeM3 = perMeter.reduce((acc, m) => acc + m.result.totalVolumeM3, 0);
  const measuredVolumeM3 = perMeter.reduce((acc, m) => acc + m.result.measuredVolumeM3, 0);
  const estimatedBoundaryVolumeM3 = perMeter.reduce(
    (acc, m) => acc + m.result.estimatedBoundaryVolumeM3,
    0
  );
  const meanCoverageRatio =
    perMeter.length > 0
      ? perMeter.reduce((acc, m) => acc + m.result.coverageRatio, 0) / perMeter.length
      : 0;

  return {
    perMeter,
    totalVolumeM3: parseFloat(totalVolumeM3.toFixed(4)),
    measuredVolumeM3: parseFloat(measuredVolumeM3.toFixed(4)),
    estimatedBoundaryVolumeM3: parseFloat(estimatedBoundaryVolumeM3.toFixed(4)),
    meanCoverageRatio: parseFloat(meanCoverageRatio.toFixed(4)),
  };
}
