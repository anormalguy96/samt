import { describe, it, expect, beforeEach } from 'vitest';
import { transitionIncident } from '../domain/incident/incidentStateMachine';
import { FixedClock } from '../domain/ports/Clock';
import type { Incident } from '../domain/ports/IncidentPort';

describe('Incident State Machine & Guarded Transitions (Lecture 2)', () => {
  let clock: FixedClock;
  let initialIncident: Incident;

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

  it('completes the full canonical lifecycle under valid events', () => {
    // 1. DETECTED -> ASSIGNED
    const assignResult = transitionIncident(
      initialIncident,
      {
        type: 'ASSIGN',
        crew: {
          crewId: 'CREW-01',
          crewName: 'Bakı Qəza Briqadası #1',
          crewPhone: '+994 50 111-22-33',
          role: 'Baş Mühəndis: Kamran',
          etaMinutes: 20,
          assignedAt: clock.now(),
        },
      },
      clock
    );
    expect(assignResult.success).toBe(true);
    expect(assignResult.incident.state).toBe('ASSIGNED');
    expect(assignResult.incident.version).toBe(2);

    // 2. ASSIGNED -> IN_REPAIR
    const repairStartResult = transitionIncident(
      assignResult.incident,
      { type: 'START_REPAIR', technicianId: 'TECH-101', checkInGps: '40.375, 49.815' },
      clock
    );
    expect(repairStartResult.success).toBe(true);
    expect(repairStartResult.incident.state).toBe('IN_REPAIR');

    // 3. IN_REPAIR -> REPAIRED
    const evidenceResult = transitionIncident(
      repairStartResult.incident,
      {
        type: 'RECORD_REPAIR_EVIDENCE',
        evidence: {
          technicianId: 'TECH-101',
          repairMethod: 'Mufta Kraun Ø200mm',
          clampType: 'Kompozit Klemma',
          photoFixtureRef: 'fixture://photos/repair-yas-01.webp',
          completedAt: clock.now(),
          technicianNotes: 'Boru qəzası təmir olundu.',
        },
      },
      clock
    );
    expect(evidenceResult.success).toBe(true);
    expect(evidenceResult.incident.state).toBe('REPAIRED');

    // 4. REPAIRED -> VERIFIED
    const verifyResult = transitionIncident(
      evidenceResult.incident,
      {
        type: 'EVALUATE_VERIFICATION',
        evaluation: {
          evaluatedAt: clock.now(),
          preRepairMnfM3h: 68.2,
          postRepairMnfM3h: 26.1,
          baselineMnfM3h: 25.0,
          verifiedLossDropM3h: 42.1,
          isSuccessful: true,
          reason: 'Post-repair flow restored to within baseline tolerance',
        },
      },
      clock
    );
    expect(verifyResult.success).toBe(true);
    expect(verifyResult.incident.state).toBe('VERIFIED');

    // 5. VERIFIED -> CLOSED
    const closeResult = transitionIncident(
      verifyResult.incident,
      { type: 'CLOSE', closedBy: 'DISPATCHER-BAKU-CENTRAL' },
      clock
    );
    expect(closeResult.success).toBe(true);
    expect(closeResult.incident.state).toBe('CLOSED');
  });

  it('rejects invalid state jumps (e.g. DETECTED directly to REPAIRED)', () => {
    const invalidJump = transitionIncident(
      initialIncident,
      {
        type: 'RECORD_REPAIR_EVIDENCE',
        evidence: {
          technicianId: 'TECH-001',
          repairMethod: 'Bypass',
          photoFixtureRef: 'ref',
          completedAt: clock.now(),
          technicianNotes: 'Skip',
        },
      },
      clock
    );
    expect(invalidJump.success).toBe(false);
    expect(invalidJump.incident.state).toBe('DETECTED');
    if (!invalidJump.success) {
      expect(invalidJump.error).toContain('Guard violation');
    }
  });

  it('enforces guards on crew assignment (requires crew details and positive ETA)', () => {
    const missingPhone = transitionIncident(
      initialIncident,
      {
        type: 'ASSIGN',
        crew: {
          crewId: 'CREW-01',
          crewName: 'Anonymous Crew',
          crewPhone: '', // Empty phone
          role: 'Helper',
          etaMinutes: 20,
          assignedAt: clock.now(),
        },
      },
      clock
    );
    expect(missingPhone.success).toBe(false);
    if (!missingPhone.success) {
      expect(missingPhone.error).toContain('crewPhone');
    }

    const zeroEta = transitionIncident(
      initialIncident,
      {
        type: 'ASSIGN',
        crew: {
          crewId: 'CREW-01',
          crewName: 'Crew A',
          crewPhone: '+994 50 123-45-67',
          role: 'Master',
          etaMinutes: 0, // ETA must be > 0
          assignedAt: clock.now(),
        },
      },
      clock
    );
    expect(zeroEta.success).toBe(false);
    if (!zeroEta.success) {
      expect(zeroEta.error).toContain('ETA must be greater than zero');
    }
  });

  it('reverts incident to IN_REPAIR for rework when hydraulic verification fails', () => {
    // Bring incident to REPAIRED
    const assigned = transitionIncident(initialIncident, {
      type: 'ASSIGN',
      crew: { crewId: 'C1', crewName: 'Crew 1', crewPhone: '+994', role: 'Eng', etaMinutes: 10, assignedAt: clock.now() },
    }, clock).incident;

    const inRepair = transitionIncident(assigned, { type: 'START_REPAIR', technicianId: 'T1' }, clock).incident;

    const repaired = transitionIncident(inRepair, {
      type: 'RECORD_REPAIR_EVIDENCE',
      evidence: { technicianId: 'T1', repairMethod: 'Clamp', photoFixtureRef: 'photo.jpg', completedAt: clock.now(), technicianNotes: 'Done' },
    }, clock).incident;

    expect(repaired.state).toBe('REPAIRED');

    // Attempt verification with failed hydraulic result (leak persists!)
    const failedVerification = transitionIncident(repaired, {
      type: 'EVALUATE_VERIFICATION',
      evaluation: {
        evaluatedAt: clock.now(),
        preRepairMnfM3h: 70.0,
        postRepairMnfM3h: 65.0, // High post-repair flow!
        baselineMnfM3h: 25.0,
        verifiedLossDropM3h: 5.0,
        isSuccessful: false, // Verification failed
        reason: 'Post-repair MNF (65 m³/h) remains far above baseline envelope (25 m³/h)',
      },
    }, clock);

    expect(failedVerification.success).toBe(true);
    // Crucial: Must transition back to IN_REPAIR for rework, NOT advance to VERIFIED!
    expect(failedVerification.incident.state).toBe('IN_REPAIR');
    if (failedVerification.success) {
      expect(failedVerification.transitionDescription).toContain('FAILED');
    }
    expect(failedVerification.incident.verificationResult?.isSuccessful).toBe(false);
  });

  it('supports the FALSE_ALARM branch and closes without repair', () => {
    const falseAlarmResult = transitionIncident(
      initialIncident,
      {
        type: 'MARK_FALSE_ALARM',
        reviewerId: 'SUPERVISOR-01',
        reason: 'Acoustic noise was due to secondary hospital booster pump activation, not pipe burst',
      },
      clock
    );
    expect(falseAlarmResult.success).toBe(true);
    expect(falseAlarmResult.incident.state).toBe('FALSE_ALARM');

    // Can be closed directly from FALSE_ALARM
    const closeResult = transitionIncident(
      falseAlarmResult.incident,
      { type: 'CLOSE', closedBy: 'DISPATCHER' },
      clock
    );
    expect(closeResult.success).toBe(true);
    expect(closeResult.incident.state).toBe('CLOSED');
  });

  it('prevents terminal states from wrapping around to DETECTED', () => {
    // Bring to CLOSED
    const closed: Incident = {
      ...initialIncident,
      state: 'CLOSED',
      version: 5,
    };

    const tryAssign = transitionIncident(closed, {
      type: 'ASSIGN',
      crew: { crewId: 'C1', crewName: 'Crew', crewPhone: '+994', role: 'Eng', etaMinutes: 10, assignedAt: clock.now() },
    }, clock);

    expect(tryAssign.success).toBe(false);
    expect(tryAssign.incident.state).toBe('CLOSED');
    if (!tryAssign.success) {
      expect(tryAssign.error).toContain('Guard violation');
    }
  });
});
