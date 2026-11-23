/**
 * Shared Application Use Case: Guarded, Idempotent, Optimistically-Locked Incident Transitions
 * Coordinates server-side RBAC, commandId idempotency, expectedVersion CAS,
 * authoritative evidence verification, and single-transaction state + audit + outbox commit.
 */

import type { Clock } from '../domain/ports/Clock.js';
import type { AuditEvent } from '../domain/ports/AuditPort.js';
import type {
  AuthorizedActor,
  CommandOutboxMessage,
  IIncidentRepository,
  Incident,
  IncidentEvent,
} from '../domain/ports/IncidentPort.js';
import {
  IdempotencyConflictError,
  IncidentNotFoundError,
  OptimisticConcurrencyError,
} from '../domain/ports/IncidentPort.js';
import {
  transitionIncident,
  type TransitionErrorCode,
  type VerificationPolicyConfig,
} from '../domain/incident/incidentStateMachine.js';
import { canonicalPayloadHash, generateId } from './hashUtils.js';

export interface ExecuteIncidentTransitionInput {
  incidentId: string;
  commandId: string;
  expectedVersion: number;
  event: IncidentEvent;
  actor: AuthorizedActor;
  correlationId?: string;
  verificationPolicy?: VerificationPolicyConfig;
  /** Optional test hook executed inside transaction right before COMMIT (for rollback verification) */
  beforeCommitHook?: () => void | Promise<void>;
}

export type ExecuteIncidentTransitionOutput =
  | {
      ok: true;
      statusCode: number;
      idempotentReplay: boolean;
      incident: Incident;
      transitionDescription: string;
      correlationId: string;
    }
  | {
      ok: false;
      statusCode: number;
      errorCode: TransitionErrorCode | 'NOT_FOUND' | 'VERSION_CONFLICT' | 'IDEMPOTENCY_CONFLICT';
      error: string;
      correlationId: string;
      currentVersion?: number;
    };

/**
 * Strips untrusted/volatile fields so payload hash reflects semantic command intent.
 */
function sanitizeEventForHash(event: IncidentEvent): Record<string, unknown> {
  switch (event.type) {
    case 'ASSIGN':
      return {
        type: event.type,
        crewId: event.crew.crewId,
        crewName: event.crew.crewName,
        crewPhone: event.crew.crewPhone,
        role: event.crew.role,
        etaMinutes: event.crew.etaMinutes,
      };
    case 'MARK_FALSE_ALARM':
      return {
        type: event.type,
        reason: event.reason,
      };
    case 'START_REPAIR':
      return {
        type: event.type,
        technicianId: event.technicianId,
        checkInGps: event.checkInGps,
      };
    case 'RECORD_REPAIR_EVIDENCE':
      return {
        type: event.type,
        technicianId: event.evidence.technicianId,
        repairMethod: event.evidence.repairMethod,
        clampType: event.evidence.clampType,
        acousticFreqHz: event.evidence.acousticFreqHz,
        photoFixtureRef: event.evidence.photoFixtureRef,
        technicianNotes: event.evidence.technicianNotes,
      };
    case 'EVALUATE_VERIFICATION':
      return {
        type: event.type,
        baselineMnfM3h: event.evidence.baselineMnfM3h,
        leakageExponent: event.evidence.leakageExponent,
        preRepairWindow: event.evidence.preRepairWindow,
        postRepairWindow: event.evidence.postRepairWindow,
      };
    case 'CLOSE':
      return {
        type: event.type,
        notes: event.notes,
      };
  }
}

export class ExecuteIncidentTransitionUseCase {
  constructor(
    private repo: IIncidentRepository,
    private clock: Clock
  ) {}

  async execute(input: ExecuteIncidentTransitionInput): Promise<ExecuteIncidentTransitionOutput> {
    const correlationId = input.correlationId ?? generateId('cor');

    if (input.actor.role === 'viewer') {
      return {
        ok: false,
        statusCode: 403,
        errorCode: 'UNAUTHORIZED_ROLE',
        error: `Forbidden: role 'viewer' (${input.actor.actorId}) cannot transition incidents`,
        correlationId,
      };
    }

    if (!input.commandId || input.commandId.trim().length === 0) {
      return {
        ok: false,
        statusCode: 400,
        errorCode: 'GUARD_VIOLATION',
        error: 'commandId (or Idempotency-Key header) is required for incident transitions',
        correlationId,
      };
    }

    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      return {
        ok: false,
        statusCode: 400,
        errorCode: 'GUARD_VIOLATION',
        error: 'expectedVersion must be a positive integer',
        correlationId,
      };
    }

    const payloadHash = await canonicalPayloadHash({
      incidentId: input.incidentId,
      expectedVersion: input.expectedVersion,
      event: sanitizeEventForHash(input.event),
    });

    // 1. Check prior committed idempotent command before evaluating stale version
    if (this.repo.getCommandOutcome) {
      const prior = await this.repo.getCommandOutcome(input.commandId);
      if (prior) {
        if (prior.payloadHash !== payloadHash || prior.incidentId !== input.incidentId) {
          return {
            ok: false,
            statusCode: 409,
            errorCode: 'IDEMPOTENCY_CONFLICT',
            error: `Idempotency conflict: commandId '${input.commandId}' was already used with a different payload`,
            correlationId,
          };
        }
        const current = await this.repo.getById(input.incidentId);
        if (!current) {
          return {
            ok: false,
            statusCode: 404,
            errorCode: 'NOT_FOUND',
            error: `Incident ${input.incidentId} not found`,
            correlationId,
          };
        }
        return {
          ok: true,
          statusCode: prior.responseStatus,
          idempotentReplay: true,
          incident: current,
          transitionDescription:
            String(prior.responseBody.transitionDescription ?? 'Idempotent replay of committed command'),
          correlationId,
        };
      }
    }

    // 2. Load incident and check expectedVersion
    const current = await this.repo.getById(input.incidentId);
    if (!current) {
      return {
        ok: false,
        statusCode: 404,
        errorCode: 'NOT_FOUND',
        error: `Incident ${input.incidentId} not found`,
        correlationId,
      };
    }

    if (current.version !== input.expectedVersion) {
      return {
        ok: false,
        statusCode: 409,
        errorCode: 'VERSION_CONFLICT',
        error: `Version conflict on incident ${input.incidentId}: expected version ${input.expectedVersion}, current version is ${current.version}`,
        correlationId,
        currentVersion: current.version,
      };
    }

    // 3. Evaluate pure domain transition
    const transition = transitionIncident(
      current,
      input.event,
      this.clock,
      input.actor,
      input.verificationPolicy
    );

    if (!transition.success) {
      const statusCode =
        transition.errorCode === 'UNAUTHORIZED_ROLE'
          ? 403
          : transition.errorCode === 'INSUFFICIENT_EVIDENCE'
          ? 422
          : 400;
      return {
        ok: false,
        statusCode,
        errorCode: transition.errorCode,
        error: transition.error,
        correlationId,
        currentVersion: current.version,
      };
    }

    const now = this.clock.now();
    const auditEvent: AuditEvent = {
      id: generateId('aud'),
      timestamp: now,
      eventType: `INCIDENT_${input.event.type}`,
      sourceComponent: 'ExecuteIncidentTransitionUseCase',
      severity:
        transition.incident.state === 'VERIFIED' || transition.incident.state === 'CLOSED'
          ? 'SUCCESS'
          : transition.incident.state === 'IN_REPAIR' && input.event.type === 'EVALUATE_VERIFICATION'
          ? 'WARN'
          : 'INFO',
      actorId: input.actor.actorId,
      actorRole: input.actor.role,
      correlationId,
      dmaId: current.dmaId,
      incidentId: current.incidentId,
      message: transition.transitionDescription,
      metadata: {
        commandId: input.commandId,
        fromState: current.state,
        toState: transition.incident.state,
        fromVersion: current.version,
        toVersion: transition.incident.version,
      },
    };

    let outboxMessage: CommandOutboxMessage | undefined;
    if (input.event.type === 'ASSIGN' && transition.incident.crewAssignment) {
      outboxMessage = {
        outboxId: generateId('out'),
        idempotencyKey: `cmd:${input.commandId}:assign`,
        incidentId: current.incidentId,
        dmaId: current.dmaId,
        recipient: transition.incident.crewAssignment.crewPhone,
        severity: current.severity === 'CRITICAL' || current.severity === 'EMERGENCY' ? 'CRITICAL' : 'WARN',
        message: `Crew ${transition.incident.crewAssignment.crewName} dispatched to ${current.dmaId} for incident ${current.incidentId}`,
        payload: {
          eventType: 'CREW_ASSIGNED',
          incidentId: current.incidentId,
          dmaId: current.dmaId,
          crewId: transition.incident.crewAssignment.crewId,
          commandId: input.commandId,
        },
      };
    }

    const responseBody: Record<string, unknown> = {
      incidentId: transition.incident.incidentId,
      state: transition.incident.state,
      version: transition.incident.version,
      transitionDescription: transition.transitionDescription,
    };

    // 4. Commit atomically via repository transaction
    try {
      if (this.repo.commitCommand) {
        const committed = await this.repo.commitCommand({
          commandId: input.commandId,
          incidentId: input.incidentId,
          expectedVersion: input.expectedVersion,
          actor: input.actor,
          eventType: input.event.type,
          payloadHash,
          nextIncident: transition.incident,
          auditEvent,
          outboxMessage,
          responseStatus: 200,
          responseBody,
          beforeCommitHook: input.beforeCommitHook,
        });

        return {
          ok: true,
          statusCode: committed.responseStatus,
          idempotentReplay: committed.idempotentReplay,
          incident: committed.incident,
          transitionDescription: String(
            committed.responseBody.transitionDescription ?? transition.transitionDescription
          ),
          correlationId,
        };
      }

      if (transition.mutated) {
        await this.repo.update(transition.incident, input.expectedVersion);
      }
      return {
        ok: true,
        statusCode: 200,
        idempotentReplay: false,
        incident: transition.incident,
        transitionDescription: transition.transitionDescription,
        correlationId,
      };
    } catch (err) {
      if (err instanceof OptimisticConcurrencyError) {
        return {
          ok: false,
          statusCode: 409,
          errorCode: 'VERSION_CONFLICT',
          error: err.message,
          correlationId,
          currentVersion: err.actualVersion,
        };
      }
      if (err instanceof IdempotencyConflictError) {
        return {
          ok: false,
          statusCode: 409,
          errorCode: 'IDEMPOTENCY_CONFLICT',
          error: err.message,
          correlationId,
        };
      }
      if (err instanceof IncidentNotFoundError) {
        return {
          ok: false,
          statusCode: 404,
          errorCode: 'NOT_FOUND',
          error: err.message,
          correlationId,
        };
      }
      throw err;
    }
  }
}
