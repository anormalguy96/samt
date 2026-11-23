import { describe, it, expect, beforeEach } from 'vitest';
import { transitionIncident } from '../domain/incident/incidentStateMachine';
import { FixedClock } from '../domain/ports/Clock';
import type { AuthorizedActor, Incident } from '../domain/ports/IncidentPort';

describe('Incident State Machine & Authoritative Verification (Lecture 2)', () => {
  let clock: FixedClock;
  let initialIncident: Incident;
  const dispatcher: AuthorizedActor = { actorId: 'dispatcher-baku-01', role: 'dispatcher' };
  const viewer: AuthorizedActor = { actorId: 'viewer-analyst-01', role: 'viewer' };

  const preStart = new Date('2026-10-19T22:00:00Z');
  const preEnd = new Date('2026-10-20T00:00:00Z');
  const postStart = new Date('2026-10-20T22:00:00Z');
  const postEnd = new Date('2026-10-21T00:00:00Z');

  beforeEach(() => {
    clock = new FixedClock('2026-10-20T03:15:00+04:00');
    initialIncident = {
      incidentId: 'INC-TEST-001',
      dmaId: 'DMA-YASAMAL-04',
      title: 'Test Pipe Burst',
      detectedAt: clock.now(),
      state: 'DETECTED',
      severity: 'CRITICAL',
      estimatedLossM3h: 38.4,
      version: 1,
    };
  });

  function bringToRepaired(inc: Incident): Incident {
    const a = transitionIncident(
      inc,
      {
        type: 'ASSIGN',
        crew: {
          crewId: 'C1',
          crewName: 'Crew 1',
          crewPhone: '+994 50 111-22-33',
          role: 'Engineer',
          etaMinutes: 15,
        },
      },
      clock,
      dispatcher
    );
    expect(a.success).toBe(true);
    const s = transitionIncident(a.incident, { type: 'START_REPAIR', technicianId: 'T1' }, clock, dispatcher);
    expect(s.success).toBe(true);
    const r = transitionIncident(
      s.incident,
      {
        type: 'RECORD_REPAIR_EVIDENCE',
        evidence: {
          technicianId: 'T1',
          repairMethod: 'Composite Clamp Ø200mm',
          photoFixtureRef: 'fixture://photos/repair-01.webp',
          technicianNotes: 'Sealed',
        },
      },
      clock,
      dispatcher
    );
    expect(r.success).toBe(true);
    return r.incident;
  }

  it('completes the full canonical lifecycle under valid evidence and authoritative actor', () => {
    const repaired = bringToRepaired(initialIncident);
    expect(repaired.state).toBe('REPAIRED');
    expect(repaired.version).toBe(4);

    const verify = transitionIncident(
      repaired,
      {
        type: 'EVALUATE_VERIFICATION',
        evidence: {
          baselineMnfM3h: 25.0,
          preRepairWindow: {
            windowStart: preStart,
            windowEnd: preEnd,
            sampleCount: 16,
            coverageRatio: 0.95,
            mnfM3h: 68.2,
            avgPressureBar: 4.0,
            provenance: 'POSTGRES_TELEMETRY',
          },
          postRepairWindow: {
            windowStart: postStart,
            windowEnd: postEnd,
            sampleCount: 16,
            coverageRatio: 0.95,
            mnfM3h: 26.1,
            avgPressureBar: 4.0,
            provenance: 'POSTGRES_TELEMETRY',
          },
        },
      },
      clock,
      dispatcher
    );

    expect(verify.success).toBe(true);
    expect(verify.incident.state).toBe('VERIFIED');
    expect(verify.incident.verificationResult?.outcome).toBe('VERIFIED_SYNTHETIC_POLICY');
    expect(verify.incident.verificationResult?.evaluatedBy).toBe('dispatcher-baku-01');

    // Attempt forged closedBy in payload: server derives authoritative actor instead
    const closed = transitionIncident(
      verify.incident,
      { type: 'CLOSE', closedBy: 'FORGED-ADMIN' },
      clock,
      dispatcher
    );
    expect(closed.success).toBe(true);
    expect(closed.incident.state).toBe('CLOSED');
    expect(closed.incident.closedBy).toBe('dispatcher-baku-01');
  });

  it('ignores forged isSuccessful=true when post-repair MNF remains unacceptably high (reverts to IN_REPAIR)', () => {
    const repaired = bringToRepaired(initialIncident);
    const forged = transitionIncident(
      repaired,
      {
        type: 'EVALUATE_VERIFICATION',
        evidence: {
          baselineMnfM3h: 25.0,
          isSuccessful: true,
          claimedSuccess: true,
          preRepairWindow: {
            windowStart: preStart,
            windowEnd: preEnd,
            sampleCount: 16,
            coverageRatio: 0.95,
            mnfM3h: 70.0,
            avgPressureBar: 4.0,
            provenance: 'POSTGRES_TELEMETRY',
          },
          postRepairWindow: {
            windowStart: postStart,
            windowEnd: postEnd,
            sampleCount: 16,
            coverageRatio: 0.95,
            mnfM3h: 65.0, // Still leaking badly!
            avgPressureBar: 4.0,
            provenance: 'POSTGRES_TELEMETRY',
          },
        },
      },
      clock,
      dispatcher
    );

    expect(forged.success).toBe(true);
    expect(forged.incident.state).toBe('IN_REPAIR');
    expect(forged.incident.verificationResult?.isSuccessful).toBe(false);
    expect(forged.incident.verificationResult?.outcome).toBe('FAILED_REWORK_REQUIRED');
  });

  it('rejects pressure-only flow reduction as rework rather than false VERIFIED', () => {
    const repaired = bringToRepaired(initialIncident);
    const pressureOnly = transitionIncident(
      repaired,
      {
        type: 'EVALUATE_VERIFICATION',
        evidence: {
          baselineMnfM3h: 25.0,
          leakageExponent: 0.5,
          preRepairWindow: {
            windowStart: preStart,
            windowEnd: preEnd,
            sampleCount: 16,
            coverageRatio: 0.95,
            mnfM3h: 100.0,
            avgPressureBar: 4.0,
            provenance: 'POSTGRES_TELEMETRY',
          },
          postRepairWindow: {
            windowStart: postStart,
            windowEnd: postEnd,
            sampleCount: 16,
            coverageRatio: 0.95,
            mnfM3h: 50.0,
            avgPressureBar: 1.0, // Pure pressure drop: normalized loss drop = 0!
            provenance: 'POSTGRES_TELEMETRY',
          },
        },
      },
      clock,
      dispatcher
    );

    expect(pressureOnly.success).toBe(true);
    expect(pressureOnly.incident.state).toBe('IN_REPAIR');
    expect(pressureOnly.incident.verificationResult?.verifiedLossDropM3h).toBeCloseTo(0, 2);
  });

  it('rejects insufficient coverage or incomparable windows without yielding VERIFIED', () => {
    const repaired = bringToRepaired(initialIncident);
    const lowCoverage = transitionIncident(
      repaired,
      {
        type: 'EVALUATE_VERIFICATION',
        evidence: {
          baselineMnfM3h: 25.0,
          isSuccessful: true,
          preRepairWindow: {
            windowStart: preStart,
            windowEnd: preEnd,
            sampleCount: 16,
            coverageRatio: 0.95,
            mnfM3h: 68.0,
            provenance: 'POSTGRES_TELEMETRY',
          },
          postRepairWindow: {
            windowStart: postStart,
            windowEnd: postEnd,
            sampleCount: 3, // Below min 8
            coverageRatio: 0.25, // Below min 0.80
            mnfM3h: 25.0,
            provenance: 'POSTGRES_TELEMETRY',
          },
        },
      },
      clock,
      dispatcher
    );

    expect(lowCoverage.success).toBe(false);
    expect(lowCoverage.incident.state).toBe('REPAIRED');
    if (!lowCoverage.success) {
      expect(lowCoverage.errorCode).toBe('INSUFFICIENT_EVIDENCE');
    }
  });

  it('blocks viewer role mutations and prevents transitions from terminal CLOSED state', () => {
    const viewerAttempt = transitionIncident(
      initialIncident,
      { type: 'MARK_FALSE_ALARM', reason: 'Viewer attempt' },
      clock,
      viewer
    );
    expect(viewerAttempt.success).toBe(false);
    if (!viewerAttempt.success) expect(viewerAttempt.errorCode).toBe('UNAUTHORIZED_ROLE');

    const closed: Incident = { ...initialIncident, state: 'CLOSED', version: 5 };
    const afterClose = transitionIncident(
      closed,
      {
        type: 'ASSIGN',
        crew: { crewId: 'C1', crewName: 'Crew', crewPhone: '+994', role: 'Eng', etaMinutes: 10 },
      },
      clock,
      dispatcher
    );
    expect(afterClose.success).toBe(false);
    if (!afterClose.success) expect(afterClose.errorCode).toBe('TERMINAL_STATE');
  });
});
