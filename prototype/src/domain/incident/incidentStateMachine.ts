/**
 * Incident Lifecycle State Machine (Lecture 2: Behavioral Modeling & State Machines)
 * Pure event-driven state transitions with typed guards, authoritative server-side
 * evidence verification, and explicit rework / insufficient-evidence / terminal branches.
 *
 * Lifecycle:
 *   DETECTED -> ASSIGNED -> IN_REPAIR -> REPAIRED -> VERIFIED -> CLOSED
 *     └──────────┴──> FALSE_ALARM ──────────────────────────────────┘
 *                               ▲            │
 *                               └────────────┴── [FAILED_REWORK_REQUIRED -> IN_REPAIR]
 *                                            └── [INSUFFICIENT_EVIDENCE -> Guard Rejection (stays REPAIRED)]
 */

import type {
  AuthorizedActor,
  Incident,
  IncidentEvent,
  VerificationEvidenceInput,
  VerificationResult,
  VerificationWindowEvidence,
} from '../ports/IncidentPort.js';
import { deepCloneIncident } from '../ports/IncidentPort.js';
import type { Clock } from '../ports/Clock.js';

export type TransitionErrorCode =
  | 'GUARD_VIOLATION'
  | 'INSUFFICIENT_EVIDENCE'
  | 'TERMINAL_STATE'
  | 'UNAUTHORIZED_ROLE'
  | 'UNKNOWN_EVENT';

export type TransitionResult =
  | { success: true; incident: Incident; transitionDescription: string; mutated: boolean }
  | { success: false; incident: Incident; error: string; errorCode: TransitionErrorCode };

export interface VerificationPolicyConfig {
  minWindowSamples: number;
  minCoverageRatio: number;
  maxWindowDurationMismatchRatio: number;
  maxAcceptableBaselineRatio: number; // e.g. 1.15 -> post-repair MNF <= baseline * 1.15
  maxAcceptableAbsoluteMarginM3h: number; // e.g. 5.0 m³/h above baseline
  minRequiredLossDropFraction: number; // e.g. at least 50% of pre-repair excess resolved
}

export const DEFAULT_VERIFICATION_POLICY: VerificationPolicyConfig = {
  minWindowSamples: 8,
  minCoverageRatio: 0.8,
  maxWindowDurationMismatchRatio: 0.15,
  maxAcceptableBaselineRatio: 1.15,
  maxAcceptableAbsoluteMarginM3h: 5.0,
  minRequiredLossDropFraction: 0.5,
};

function isValidWindow(win: VerificationWindowEvidence | undefined): {
  valid: boolean;
  durationMs: number;
  reason?: string;
} {
  if (!win) {
    return { valid: false, durationMs: 0, reason: 'Missing verification window evidence' };
  }
  if (!(win.windowStart instanceof Date) || !Number.isFinite(win.windowStart.getTime())) {
    return { valid: false, durationMs: 0, reason: 'Invalid windowStart timestamp' };
  }
  if (!(win.windowEnd instanceof Date) || !Number.isFinite(win.windowEnd.getTime())) {
    return { valid: false, durationMs: 0, reason: 'Invalid windowEnd timestamp' };
  }
  const durationMs = win.windowEnd.getTime() - win.windowStart.getTime();
  if (durationMs <= 0) {
    return { valid: false, durationMs: 0, reason: 'windowEnd must be after windowStart' };
  }
  if (!Number.isFinite(win.mnfM3h) || win.mnfM3h < 0) {
    return { valid: false, durationMs, reason: `Non-finite or negative MNF reading (${win.mnfM3h})` };
  }
  if (!Number.isInteger(win.sampleCount) || win.sampleCount < 0) {
    return { valid: false, durationMs, reason: `Invalid sampleCount (${win.sampleCount})` };
  }
  if (!Number.isFinite(win.coverageRatio) || win.coverageRatio < 0 || win.coverageRatio > 1) {
    return { valid: false, durationMs, reason: `Invalid coverageRatio (${win.coverageRatio})` };
  }
  if (win.avgPressureBar !== undefined && (!Number.isFinite(win.avgPressureBar) || win.avgPressureBar <= 0)) {
    return { valid: false, durationMs, reason: `Invalid avgPressureBar (${win.avgPressureBar})` };
  }
  if (
    win.authorizedAllowanceM3h !== undefined &&
    (!Number.isFinite(win.authorizedAllowanceM3h) || win.authorizedAllowanceM3h < 0)
  ) {
    return {
      valid: false,
      durationMs,
      reason: `Invalid authorizedAllowanceM3h (${win.authorizedAllowanceM3h})`,
    };
  }
  if (!win.provenance || win.provenance.trim().length === 0) {
    return { valid: false, durationMs, reason: 'Missing evidence provenance identifier' };
  }
  return { valid: true, durationMs };
}

/**
 * Authoritative domain evaluation of repair verification evidence.
 * Explicitly IGNORES any caller-supplied isSuccessful / claimedSuccess boolean.
 */
export function evaluateVerificationEvidence(
  input: VerificationEvidenceInput,
  now: Date,
  actorId: string,
  policy: VerificationPolicyConfig = DEFAULT_VERIFICATION_POLICY
): VerificationResult {
  const policyLabel =
    'Synthetic verification under SAMT v1.1.0 policy (not field-measured physical repair certification)';

  if (!Number.isFinite(input.baselineMnfM3h) || input.baselineMnfM3h <= 0) {
    return {
      evaluatedAt: new Date(now.getTime()),
      evaluatedBy: actorId,
      outcome: 'INSUFFICIENT_EVIDENCE',
      preRepairMnfM3h: 0,
      postRepairMnfM3h: 0,
      pressureNormalizedPreMnfM3h: 0,
      baselineMnfM3h: 0,
      verifiedLossDropM3h: 0,
      isSuccessful: false,
      policyLabel,
      assumptions: ['Baseline MNF reference must be a finite positive number'],
      reason: `Insufficient evidence: invalid baselineMnfM3h (${input.baselineMnfM3h})`,
    };
  }

  const alpha = input.leakageExponent ?? 0.5;
  if (!Number.isFinite(alpha) || alpha < 0.5 || alpha > 1.5) {
    return {
      evaluatedAt: new Date(now.getTime()),
      evaluatedBy: actorId,
      outcome: 'INSUFFICIENT_EVIDENCE',
      preRepairMnfM3h: 0,
      postRepairMnfM3h: 0,
      pressureNormalizedPreMnfM3h: 0,
      baselineMnfM3h: input.baselineMnfM3h,
      verifiedLossDropM3h: 0,
      isSuccessful: false,
      policyLabel,
      assumptions: ['Torricelli leakage exponent alpha must lie within [0.5, 1.5]'],
      reason: `Insufficient evidence: invalid leakage exponent alpha=${alpha}`,
    };
  }

  const preCheck = isValidWindow(input.preRepairWindow);
  const postCheck = isValidWindow(input.postRepairWindow);

  if (!preCheck.valid || !postCheck.valid) {
    return {
      evaluatedAt: new Date(now.getTime()),
      evaluatedBy: actorId,
      outcome: 'INSUFFICIENT_EVIDENCE',
      preRepairMnfM3h: preCheck.valid ? input.preRepairWindow.mnfM3h : 0,
      postRepairMnfM3h: postCheck.valid ? input.postRepairWindow.mnfM3h : 0,
      pressureNormalizedPreMnfM3h: 0,
      baselineMnfM3h: input.baselineMnfM3h,
      verifiedLossDropM3h: 0,
      isSuccessful: false,
      policyLabel,
      preRepairWindow: input.preRepairWindow,
      postRepairWindow: input.postRepairWindow,
      assumptions: [],
      reason: `Insufficient evidence: ${!preCheck.valid ? `pre-repair window (${preCheck.reason})` : `post-repair window (${postCheck.reason})`}`,
    };
  }

  const pre = input.preRepairWindow;
  const post = input.postRepairWindow;

  // Post-repair window must not end before pre-repair window ends
  if (post.windowStart.getTime() < pre.windowEnd.getTime()) {
    return {
      evaluatedAt: new Date(now.getTime()),
      evaluatedBy: actorId,
      outcome: 'INSUFFICIENT_EVIDENCE',
      preRepairMnfM3h: pre.mnfM3h,
      postRepairMnfM3h: post.mnfM3h,
      pressureNormalizedPreMnfM3h: pre.mnfM3h,
      baselineMnfM3h: input.baselineMnfM3h,
      verifiedLossDropM3h: 0,
      isSuccessful: false,
      policyLabel,
      preRepairWindow: pre,
      postRepairWindow: post,
      assumptions: [],
      reason: 'Insufficient evidence: post-repair observation window overlaps or precedes pre-repair window',
    };
  }

  // Comparable window duration check
  const maxDur = Math.max(preCheck.durationMs, postCheck.durationMs);
  const durDiffRatio = Math.abs(preCheck.durationMs - postCheck.durationMs) / maxDur;
  if (durDiffRatio > policy.maxWindowDurationMismatchRatio) {
    return {
      evaluatedAt: new Date(now.getTime()),
      evaluatedBy: actorId,
      outcome: 'INSUFFICIENT_EVIDENCE',
      preRepairMnfM3h: pre.mnfM3h,
      postRepairMnfM3h: post.mnfM3h,
      pressureNormalizedPreMnfM3h: pre.mnfM3h,
      baselineMnfM3h: input.baselineMnfM3h,
      verifiedLossDropM3h: 0,
      isSuccessful: false,
      policyLabel,
      preRepairWindow: pre,
      postRepairWindow: post,
      assumptions: [],
      reason: `Insufficient evidence: incomparable pre/post window durations (${(durDiffRatio * 100).toFixed(1)}% difference > ${(policy.maxWindowDurationMismatchRatio * 100).toFixed(0)}% max)`,
    };
  }

  // Minimum sample and coverage checks on both windows
  if (
    pre.sampleCount < policy.minWindowSamples ||
    post.sampleCount < policy.minWindowSamples ||
    pre.coverageRatio < policy.minCoverageRatio ||
    post.coverageRatio < policy.minCoverageRatio
  ) {
    return {
      evaluatedAt: new Date(now.getTime()),
      evaluatedBy: actorId,
      outcome: 'INSUFFICIENT_EVIDENCE',
      preRepairMnfM3h: pre.mnfM3h,
      postRepairMnfM3h: post.mnfM3h,
      pressureNormalizedPreMnfM3h: pre.mnfM3h,
      baselineMnfM3h: input.baselineMnfM3h,
      verifiedLossDropM3h: 0,
      isSuccessful: false,
      policyLabel,
      preRepairWindow: pre,
      postRepairWindow: post,
      assumptions: [
        `Required minimum coverage >= ${(policy.minCoverageRatio * 100).toFixed(0)}% and samples >= ${policy.minWindowSamples}`,
      ],
      reason: `Insufficient evidence: coverage/sample threshold unmet (pre: n=${pre.sampleCount}, cov=${(pre.coverageRatio * 100).toFixed(1)}%; post: n=${post.sampleCount}, cov=${(post.coverageRatio * 100).toFixed(1)}%)`,
    };
  }

  // Adjust for authorized consumption allowance if provided
  const preNetFlow = Math.max(0, pre.mnfM3h - (pre.authorizedAllowanceM3h ?? 0));
  const postNetFlow = Math.max(0, post.mnfM3h - (post.authorizedAllowanceM3h ?? 0));

  // Torricelli pressure normalization when both pressures are available
  const assumptions: string[] = [
    `Pre-repair provenance: ${pre.provenance} (n=${pre.sampleCount}, coverage=${(pre.coverageRatio * 100).toFixed(1)}%)`,
    `Post-repair provenance: ${post.provenance} (n=${post.sampleCount}, coverage=${(post.coverageRatio * 100).toFixed(1)}%)`,
    `Authorized night allowance: pre=${(pre.authorizedAllowanceM3h ?? 0).toFixed(2)} m³/h, post=${(post.authorizedAllowanceM3h ?? 0).toFixed(2)} m³/h`,
  ];

  let pressureNormalizedPreMnf = preNetFlow;
  let effectiveBaseline = input.baselineMnfM3h;
  if (pre.avgPressureBar !== undefined && post.avgPressureBar !== undefined) {
    const pressureFactor = Math.pow(post.avgPressureBar / pre.avgPressureBar, alpha);
    pressureNormalizedPreMnf = preNetFlow * pressureFactor;
    effectiveBaseline = input.baselineMnfM3h * pressureFactor;
    assumptions.push(
      `Pressure-normalized pre-repair & baseline flows from ${pre.avgPressureBar.toFixed(2)} bar to ${post.avgPressureBar.toFixed(2)} bar using Torricelli α=${alpha.toFixed(2)}`
    );
  } else {
    assumptions.push(
      'Comparable operating pressure assumed across pre/post windows (pressure telemetry omitted on one or both windows)'
    );
  }

  const verifiedLossDropM3h = pressureNormalizedPreMnf - postNetFlow;
  const preExcess = Math.max(0, pressureNormalizedPreMnf - effectiveBaseline);
  const acceptableEnvelope = Math.max(
    effectiveBaseline * policy.maxAcceptableBaselineRatio,
    effectiveBaseline + policy.maxAcceptableAbsoluteMarginM3h
  );
  const resolvedFraction = preExcess > 0 ? verifiedLossDropM3h / preExcess : verifiedLossDropM3h > 0 ? 1 : 0;

  const returnedToBaseline = postNetFlow <= acceptableEnvelope;
  const meaningfulDrop = verifiedLossDropM3h > 0 && (preExcess <= 0 || resolvedFraction >= policy.minRequiredLossDropFraction);

  if (returnedToBaseline && meaningfulDrop) {
    return {
      evaluatedAt: new Date(now.getTime()),
      evaluatedBy: actorId,
      outcome: 'VERIFIED_SYNTHETIC_POLICY',
      preRepairMnfM3h: parseFloat(pre.mnfM3h.toFixed(2)),
      postRepairMnfM3h: parseFloat(post.mnfM3h.toFixed(2)),
      pressureNormalizedPreMnfM3h: parseFloat(pressureNormalizedPreMnf.toFixed(2)),
      baselineMnfM3h: parseFloat(input.baselineMnfM3h.toFixed(2)),
      verifiedLossDropM3h: parseFloat(verifiedLossDropM3h.toFixed(2)),
      isSuccessful: true,
      policyLabel,
      preRepairWindow: pre,
      postRepairWindow: post,
      assumptions,
      reason: `Verified under synthetic policy: post-repair MNF (${postNetFlow.toFixed(2)} m³/h) is within acceptable envelope (<= ${acceptableEnvelope.toFixed(2)} m³/h) with pressure-normalized drop of ${verifiedLossDropM3h.toFixed(2)} m³/h`,
    };
  }

  return {
    evaluatedAt: new Date(now.getTime()),
    evaluatedBy: actorId,
    outcome: 'FAILED_REWORK_REQUIRED',
    preRepairMnfM3h: parseFloat(pre.mnfM3h.toFixed(2)),
    postRepairMnfM3h: parseFloat(post.mnfM3h.toFixed(2)),
    pressureNormalizedPreMnfM3h: parseFloat(pressureNormalizedPreMnf.toFixed(2)),
    baselineMnfM3h: parseFloat(input.baselineMnfM3h.toFixed(2)),
    verifiedLossDropM3h: parseFloat(verifiedLossDropM3h.toFixed(2)),
    isSuccessful: false,
    policyLabel,
    preRepairWindow: pre,
    postRepairWindow: post,
    assumptions,
    reason: `Verification failed (rework required): post-repair MNF (${postNetFlow.toFixed(2)} m³/h) exceeds envelope (${acceptableEnvelope.toFixed(2)} m³/h) or pressure-normalized drop (${verifiedLossDropM3h.toFixed(2)} m³/h) is insufficient`,
  };
}

const DEFAULT_ACTOR: AuthorizedActor = {
  actorId: 'system-domain',
  role: 'dispatcher',
};

/**
 * Pure state machine transition function.
 * Authoritative actor and verification verdict are never trusted from untrusted payload flags.
 */
export function transitionIncident(
  current: Incident,
  event: IncidentEvent,
  clock: Clock,
  actor: AuthorizedActor = DEFAULT_ACTOR,
  verificationPolicy: VerificationPolicyConfig = DEFAULT_VERIFICATION_POLICY
): TransitionResult {
  const snapshot = deepCloneIncident(current);
  const now = clock.now();

  if (actor.role === 'viewer') {
    return {
      success: false,
      incident: snapshot,
      errorCode: 'UNAUTHORIZED_ROLE',
      error: `Authorization violation: role 'viewer' (${actor.actorId}) cannot mutate incident state`,
    };
  }

  if (snapshot.state === 'CLOSED') {
    return {
      success: false,
      incident: snapshot,
      errorCode: 'TERMINAL_STATE',
      error: `Guard violation: Incident ${snapshot.incidentId} is in terminal state CLOSED and cannot transition further`,
    };
  }

  switch (event.type) {
    case 'ASSIGN': {
      if (snapshot.state !== 'DETECTED') {
        return {
          success: false,
          incident: snapshot,
          errorCode: 'GUARD_VIOLATION',
          error: `Guard violation: Cannot assign crew to incident in state ${snapshot.state} (must be DETECTED)`,
        };
      }

      if (
        !event.crew ||
        !event.crew.crewId?.trim() ||
        !event.crew.crewName?.trim() ||
        !event.crew.crewPhone?.trim() ||
        !event.crew.role?.trim()
      ) {
        return {
          success: false,
          incident: snapshot,
          errorCode: 'GUARD_VIOLATION',
          error: 'Guard violation: Assignment requires valid crew reference (crewId, crewName, crewPhone, and role)',
        };
      }

      if (!Number.isFinite(event.crew.etaMinutes) || event.crew.etaMinutes <= 0) {
        return {
          success: false,
          incident: snapshot,
          errorCode: 'GUARD_VIOLATION',
          error: 'Guard violation: Crew ETA must be greater than zero',
        };
      }

      const updated: Incident = {
        ...snapshot,
        state: 'ASSIGNED',
        crewAssignment: {
          crewId: event.crew.crewId.trim(),
          crewName: event.crew.crewName.trim(),
          crewPhone: event.crew.crewPhone.trim(),
          role: event.crew.role.trim(),
          etaMinutes: event.crew.etaMinutes,
          assignedAt: now,
          assignedBy: actor.actorId,
        },
        version: snapshot.version + 1,
      };

      return {
        success: true,
        incident: updated,
        mutated: true,
        transitionDescription: `Incident ${snapshot.incidentId}: DETECTED -> ASSIGNED by ${actor.actorId} (Crew: ${updated.crewAssignment!.crewName}, ETA: ${updated.crewAssignment!.etaMinutes} min)`,
      };
    }

    case 'MARK_FALSE_ALARM': {
      if (snapshot.state !== 'DETECTED' && snapshot.state !== 'ASSIGNED') {
        return {
          success: false,
          incident: snapshot,
          errorCode: 'GUARD_VIOLATION',
          error: `Guard violation: Cannot mark incident as false alarm from state ${snapshot.state}`,
        };
      }

      if (!event.reason || event.reason.trim().length === 0) {
        return {
          success: false,
          incident: snapshot,
          errorCode: 'GUARD_VIOLATION',
          error: 'Guard violation: False alarm declaration requires documented reason code/notes',
        };
      }

      // Authoritative reviewer comes from authenticated actor, never request payload
      const updated: Incident = {
        ...snapshot,
        state: 'FALSE_ALARM',
        falseAlarmReason: `[${actor.actorId}] ${event.reason.trim()}`,
        version: snapshot.version + 1,
      };

      return {
        success: true,
        incident: updated,
        mutated: true,
        transitionDescription: `Incident ${snapshot.incidentId}: ${snapshot.state} -> FALSE_ALARM by ${actor.actorId} (Reason: ${event.reason.trim()})`,
      };
    }

    case 'START_REPAIR': {
      if (snapshot.state !== 'ASSIGNED' && snapshot.state !== 'IN_REPAIR') {
        return {
          success: false,
          incident: snapshot,
          errorCode: 'GUARD_VIOLATION',
          error: `Guard violation: Cannot start repair from state ${snapshot.state} (must be ASSIGNED or returning from failed verification)`,
        };
      }

      if (!event.technicianId || event.technicianId.trim().length === 0) {
        return {
          success: false,
          incident: snapshot,
          errorCode: 'GUARD_VIOLATION',
          error: 'Guard violation: Starting repair requires non-empty technicianId',
        };
      }

      if (snapshot.state === 'IN_REPAIR') {
        return {
          success: true,
          incident: snapshot,
          mutated: false,
          transitionDescription: `Incident ${snapshot.incidentId}: Already in IN_REPAIR state (No-op idempotent transition)`,
        };
      }

      const updated: Incident = {
        ...snapshot,
        state: 'IN_REPAIR',
        version: snapshot.version + 1,
      };

      return {
        success: true,
        incident: updated,
        mutated: true,
        transitionDescription: `Incident ${snapshot.incidentId}: ASSIGNED -> IN_REPAIR by ${actor.actorId} (Technician: ${event.technicianId.trim()})`,
      };
    }

    case 'RECORD_REPAIR_EVIDENCE': {
      if (snapshot.state !== 'IN_REPAIR') {
        return {
          success: false,
          incident: snapshot,
          errorCode: 'GUARD_VIOLATION',
          error: `Guard violation: Cannot record repair evidence in state ${snapshot.state} (must be IN_REPAIR)`,
        };
      }

      if (
        !event.evidence ||
        !event.evidence.technicianId?.trim() ||
        !event.evidence.repairMethod?.trim() ||
        !event.evidence.photoFixtureRef?.trim()
      ) {
        return {
          success: false,
          incident: snapshot,
          errorCode: 'GUARD_VIOLATION',
          error:
            'Guard violation: Repair completion requires technicianId, documented repairMethod, and photoFixtureRef',
        };
      }

      const updated: Incident = {
        ...snapshot,
        state: 'REPAIRED',
        repairEvidence: {
          technicianId: event.evidence.technicianId.trim(),
          repairMethod: event.evidence.repairMethod.trim(),
          clampType: event.evidence.clampType?.trim(),
          acousticFreqHz: event.evidence.acousticFreqHz,
          photoFixtureRef: event.evidence.photoFixtureRef.trim(),
          technicianNotes: event.evidence.technicianNotes?.trim() ?? '',
          completedAt: now,
          recordedBy: actor.actorId,
        },
        version: snapshot.version + 1,
      };

      return {
        success: true,
        incident: updated,
        mutated: true,
        transitionDescription: `Incident ${snapshot.incidentId}: IN_REPAIR -> REPAIRED by ${actor.actorId} (Method: ${updated.repairEvidence!.repairMethod})`,
      };
    }

    case 'EVALUATE_VERIFICATION': {
      if (snapshot.state !== 'REPAIRED') {
        return {
          success: false,
          incident: snapshot,
          errorCode: 'GUARD_VIOLATION',
          error: `Guard violation: Cannot evaluate verification in state ${snapshot.state} (must be REPAIRED)`,
        };
      }

      const evaluation = evaluateVerificationEvidence(
        event.evidence,
        now,
        actor.actorId,
        verificationPolicy
      );

      if (evaluation.outcome === 'INSUFFICIENT_EVIDENCE') {
        return {
          success: false,
          incident: snapshot,
          errorCode: 'INSUFFICIENT_EVIDENCE',
          error: evaluation.reason,
        };
      }

      if (evaluation.outcome === 'FAILED_REWORK_REQUIRED') {
        const reworked: Incident = {
          ...snapshot,
          state: 'IN_REPAIR',
          verificationResult: evaluation,
          version: snapshot.version + 1,
        };
        return {
          success: true,
          incident: reworked,
          mutated: true,
          transitionDescription: `Incident ${snapshot.incidentId}: Verification FAILED (${evaluation.reason}). Reverted to IN_REPAIR for rework.`,
        };
      }

      const verified: Incident = {
        ...snapshot,
        state: 'VERIFIED',
        verificationResult: evaluation,
        version: snapshot.version + 1,
      };

      return {
        success: true,
        incident: verified,
        mutated: true,
        transitionDescription: `Incident ${snapshot.incidentId}: REPAIRED -> VERIFIED under synthetic policy by ${actor.actorId} (Pressure-normalized loss drop: ${evaluation.verifiedLossDropM3h.toFixed(2)} m³/h)`,
      };
    }

    case 'CLOSE': {
      if (snapshot.state !== 'VERIFIED' && snapshot.state !== 'FALSE_ALARM') {
        return {
          success: false,
          incident: snapshot,
          errorCode: 'GUARD_VIOLATION',
          error: `Guard violation: Cannot close incident in state ${snapshot.state} (must be VERIFIED or FALSE_ALARM)`,
        };
      }

      const closed: Incident = {
        ...snapshot,
        state: 'CLOSED',
        closedAt: now,
        closedBy: actor.actorId,
        version: snapshot.version + 1,
      };

      return {
        success: true,
        incident: closed,
        mutated: true,
        transitionDescription: `Incident ${snapshot.incidentId}: ${snapshot.state} -> CLOSED by ${actor.actorId}`,
      };
    }

    default: {
      return {
        success: false,
        incident: snapshot,
        errorCode: 'UNKNOWN_EVENT',
        error: 'Unknown incident event type',
      };
    }
  }
}
