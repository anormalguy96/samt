/**
 * Incident Lifecycle State Machine (Lecture 2: Behavioral Modeling & State Machines)
 * Pure event-driven state transitions with typed guards and explicit failure branches.
 * 
 * Invariants & Lifecycle:
 * DETECTED -> ASSIGNED -> IN_REPAIR -> REPAIRED -> VERIFIED -> CLOSED
 *  └─> FALSE_ALARM ─────────────────────────────────────────────┘
 *                     ▲                      │
 *                     └─── [Failed Verification: Rework Needed]
 */

import type { 
  Incident, 
  IncidentEvent 
} from '../ports/IncidentPort';
import type { Clock } from '../ports/Clock';

export type TransitionResult = 
  | { success: true; incident: Incident; transitionDescription: string }
  | { success: false; incident: Incident; error: string };

/**
 * Pure state machine transition function.
 * Given the current incident state and an event, returns either the updated incident
 * or a typed failure explanation without mutating inputs or executing side-effects.
 */
export function transitionIncident(
  current: Incident,
  event: IncidentEvent,
  clock: Clock
): TransitionResult {
  const now = clock.now();

  switch (event.type) {
    case 'ASSIGN': {
      if (current.state !== 'DETECTED') {
        return {
          success: false,
          incident: current,
          error: `Guard violation: Cannot assign crew to incident in state ${current.state} (must be DETECTED)`,
        };
      }

      if (!event.crew || !event.crew.crewId || !event.crew.crewName || !event.crew.crewPhone) {
        return {
          success: false,
          incident: current,
          error: 'Guard violation: Assignment requires valid crew reference (crewId, crewName, and crewPhone)',
        };
      }

      if (event.crew.etaMinutes <= 0) {
        return {
          success: false,
          incident: current,
          error: 'Guard violation: Crew ETA must be greater than zero',
        };
      }

      const updated: Incident = {
        ...current,
        state: 'ASSIGNED',
        crewAssignment: {
          ...event.crew,
          assignedAt: now,
        },
        version: current.version + 1,
      };

      return {
        success: true,
        incident: updated,
        transitionDescription: `Incident ${current.incidentId}: DETECTED -> ASSIGNED (Crew: ${event.crew.crewName}, ETA: ${event.crew.etaMinutes} min)`,
      };
    }

    case 'MARK_FALSE_ALARM': {
      if (current.state !== 'DETECTED' && current.state !== 'ASSIGNED') {
        return {
          success: false,
          incident: current,
          error: `Guard violation: Cannot mark incident as false alarm from state ${current.state}`,
        };
      }

      if (!event.reason || event.reason.trim().length === 0) {
        return {
          success: false,
          incident: current,
          error: 'Guard violation: False alarm declaration requires documented reason code/notes',
        };
      }

      const updated: Incident = {
        ...current,
        state: 'FALSE_ALARM',
        falseAlarmReason: `[${event.reviewerId}] ${event.reason}`,
        version: current.version + 1,
      };

      return {
        success: true,
        incident: updated,
        transitionDescription: `Incident ${current.incidentId}: ${current.state} -> FALSE_ALARM (Reason: ${event.reason})`,
      };
    }

    case 'START_REPAIR': {
      if (current.state !== 'ASSIGNED' && current.state !== 'IN_REPAIR') {
        return {
          success: false,
          incident: current,
          error: `Guard violation: Cannot start repair from state ${current.state} (must be ASSIGNED or returning from failed verification)`,
        };
      }

      // Idempotent transition if already IN_REPAIR
      if (current.state === 'IN_REPAIR') {
        return {
          success: true,
          incident: current,
          transitionDescription: `Incident ${current.incidentId}: Already in IN_REPAIR state (Idempotent call)`,
        };
      }

      const updated: Incident = {
        ...current,
        state: 'IN_REPAIR',
        version: current.version + 1,
      };

      return {
        success: true,
        incident: updated,
        transitionDescription: `Incident ${current.incidentId}: ASSIGNED -> IN_REPAIR (Technician: ${event.technicianId} arrived)`,
      };
    }

    case 'RECORD_REPAIR_EVIDENCE': {
      if (current.state !== 'IN_REPAIR') {
        return {
          success: false,
          incident: current,
          error: `Guard violation: Cannot record repair evidence in state ${current.state} (must be IN_REPAIR)`,
        };
      }

      if (!event.evidence.repairMethod || !event.evidence.photoFixtureRef) {
        return {
          success: false,
          incident: current,
          error: 'Guard violation: Repair completion requires documented repair method and photo fixture reference',
        };
      }

      const updated: Incident = {
        ...current,
        state: 'REPAIRED',
        repairEvidence: {
          ...event.evidence,
          completedAt: now,
        },
        version: current.version + 1,
      };

      return {
        success: true,
        incident: updated,
        transitionDescription: `Incident ${current.incidentId}: IN_REPAIR -> REPAIRED (Method: ${event.evidence.repairMethod})`,
      };
    }

    case 'EVALUATE_VERIFICATION': {
      if (current.state !== 'REPAIRED') {
        return {
          success: false,
          incident: current,
          error: `Guard violation: Cannot evaluate verification in state ${current.state} (must be REPAIRED)`,
        };
      }

      const evalData = event.evaluation;
      const isSuccessful = evalData.isSuccessful;

      if (!isSuccessful) {
        // Verification failed: Leak persists! Return to IN_REPAIR for rework!
        const reworked: Incident = {
          ...current,
          state: 'IN_REPAIR',
          verificationResult: {
            ...evalData,
            evaluatedAt: now,
          },
          version: current.version + 1,
        };

        return {
          success: true,
          incident: reworked,
          transitionDescription: `Incident ${current.incidentId}: Verification FAILED (${evalData.reason}). Reverted to IN_REPAIR for rework.`,
        };
      }

      // Verification passed
      const verified: Incident = {
        ...current,
        state: 'VERIFIED',
        verificationResult: {
          ...evalData,
          evaluatedAt: now,
        },
        version: current.version + 1,
      };

      return {
        success: true,
        incident: verified,
        transitionDescription: `Incident ${current.incidentId}: REPAIRED -> VERIFIED (Hydraulic loss drop: ${evalData.verifiedLossDropM3h.toFixed(1)} m³/h confirmed)`,
      };
    }

    case 'CLOSE': {
      if (current.state !== 'VERIFIED' && current.state !== 'FALSE_ALARM') {
        return {
          success: false,
          incident: current,
          error: `Guard violation: Cannot close incident in state ${current.state} (must be VERIFIED or FALSE_ALARM)`,
        };
      }

      const closed: Incident = {
        ...current,
        state: 'CLOSED',
        closedAt: now,
        version: current.version + 1,
      };

      return {
        success: true,
        incident: closed,
        transitionDescription: `Incident ${current.incidentId}: ${current.state} -> CLOSED by ${event.closedBy}`,
      };
    }

    default: {
      return {
        success: false,
        incident: current,
        error: 'Unknown incident event type',
      };
    }
  }
}
