/**
 * In-Memory Incident Repository Adapter (Lecture 4: Hexagonal Ports & Adapters)
 * Enforces strict expectedVersion compare-and-swap, deep-cloned isolation,
 * idempotent command replay, and atomic transaction rollback on injected failure.
 */

import type {
  AtomicCommandRequest,
  AtomicCommandResult,
  CommandOutboxMessage,
  IIncidentRepository,
  Incident,
  StoredCommandOutcome,
} from '../ports/IncidentPort.js';
import {
  DuplicateIncidentError,
  IdempotencyConflictError,
  IncidentNotFoundError,
  OptimisticConcurrencyError,
  deepCloneIncident,
  validateIncidentRecord,
} from '../ports/IncidentPort.js';
import type { AuditEvent } from '../ports/AuditPort.js';

export class InMemoryIncidentRepository implements IIncidentRepository {
  private store = new Map<string, Incident>();
  private commands = new Map<string, StoredCommandOutcome>();
  private committedAudits: AuditEvent[] = [];
  private committedOutbox: CommandOutboxMessage[] = [];

  constructor(initialIncidents: Incident[] = []) {
    for (const raw of initialIncidents) {
      const validated = validateIncidentRecord(raw);
      if (this.store.has(validated.incidentId)) {
        throw new DuplicateIncidentError(validated.incidentId);
      }
      this.store.set(validated.incidentId, deepCloneIncident(validated));
    }
  }

  async getById(id: string): Promise<Incident | undefined> {
    const found = this.store.get(id);
    return found ? deepCloneIncident(found) : undefined;
  }

  async getAll(): Promise<Incident[]> {
    return Array.from(this.store.values())
      .map((inc) => deepCloneIncident(inc))
      .sort((a, b) => {
        const dt = b.detectedAt.getTime() - a.detectedAt.getTime();
        return dt !== 0 ? dt : a.incidentId.localeCompare(b.incidentId);
      });
  }

  async getByDma(dmaId: string): Promise<Incident[]> {
    return (await this.getAll()).filter((inc) => inc.dmaId === dmaId);
  }

  async save(incident: Incident): Promise<void> {
    const validated = validateIncidentRecord(incident);
    if (this.store.has(validated.incidentId)) {
      throw new DuplicateIncidentError(validated.incidentId);
    }
    this.store.set(validated.incidentId, deepCloneIncident(validated));
  }

  async update(incident: Incident, expectedVersion: number): Promise<void> {
    const validated = validateIncidentRecord(incident);
    const existing = this.store.get(validated.incidentId);
    if (!existing) {
      throw new IncidentNotFoundError(validated.incidentId);
    }
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new OptimisticConcurrencyError(validated.incidentId, expectedVersion, existing.version);
    }
    if (existing.version !== expectedVersion || validated.version !== expectedVersion + 1) {
      throw new OptimisticConcurrencyError(validated.incidentId, expectedVersion, existing.version);
    }
    this.store.set(validated.incidentId, deepCloneIncident(validated));
  }

  async getCommandOutcome(commandId: string): Promise<StoredCommandOutcome | undefined> {
    const found = this.commands.get(commandId);
    return found ? structuredClone(found) : undefined;
  }

  async commitCommand(request: AtomicCommandRequest): Promise<AtomicCommandResult> {
    // 1. Check idempotent command ledger first
    const prior = this.commands.get(request.commandId);
    if (prior) {
      if (prior.payloadHash !== request.payloadHash || prior.incidentId !== request.incidentId) {
        throw new IdempotencyConflictError(request.commandId);
      }
      const latest = this.store.get(request.incidentId);
      if (!latest) {
        throw new IncidentNotFoundError(request.incidentId);
      }
      return {
        idempotentReplay: true,
        responseStatus: prior.responseStatus,
        responseBody: structuredClone(prior.responseBody),
        incident: deepCloneIncident(latest),
      };
    }

    // 2. Validate CAS precondition
    const existing = this.store.get(request.incidentId);
    if (!existing) {
      throw new IncidentNotFoundError(request.incidentId);
    }
    if (existing.version !== request.expectedVersion) {
      throw new OptimisticConcurrencyError(
        request.incidentId,
        request.expectedVersion,
        existing.version
      );
    }

    const validatedNext = validateIncidentRecord(request.nextIncident);
    const isMutating = validatedNext.version !== existing.version;
    if (isMutating && validatedNext.version !== request.expectedVersion + 1) {
      throw new OptimisticConcurrencyError(
        request.incidentId,
        request.expectedVersion,
        existing.version
      );
    }

    // 3. Stage in transaction snapshot so failure before commit rolls back everything
    const prevIncident = deepCloneIncident(existing);
    const prevAuditLen = this.committedAudits.length;
    const prevOutboxLen = this.committedOutbox.length;

    try {
      this.store.set(validatedNext.incidentId, deepCloneIncident(validatedNext));
      this.committedAudits.push({
        ...request.auditEvent,
        timestamp: new Date(request.auditEvent.timestamp.getTime()),
        metadata: request.auditEvent.metadata ? structuredClone(request.auditEvent.metadata) : undefined,
      });
      if (request.outboxMessage) {
        this.committedOutbox.push(structuredClone(request.outboxMessage));
      }
      this.commands.set(request.commandId, {
        commandId: request.commandId,
        incidentId: request.incidentId,
        payloadHash: request.payloadHash,
        responseStatus: request.responseStatus,
        responseBody: structuredClone(request.responseBody),
      });

      if (request.beforeCommitHook) {
        await request.beforeCommitHook();
      }
    } catch (err) {
      // Atomic rollback
      this.store.set(prevIncident.incidentId, prevIncident);
      this.committedAudits.length = prevAuditLen;
      this.committedOutbox.length = prevOutboxLen;
      this.commands.delete(request.commandId);
      throw err;
    }

    return {
      idempotentReplay: false,
      responseStatus: request.responseStatus,
      responseBody: structuredClone(request.responseBody),
      incident: deepCloneIncident(validatedNext),
    };
  }

  getCommittedAuditEvents(): AuditEvent[] {
    return this.committedAudits.map((e) => ({
      ...e,
      timestamp: new Date(e.timestamp.getTime()),
      metadata: e.metadata ? structuredClone(e.metadata) : undefined,
    }));
  }

  getCommittedOutboxMessages(): CommandOutboxMessage[] {
    return this.committedOutbox.map((m) => structuredClone(m));
  }

  clear(): void {
    this.store.clear();
    this.commands.clear();
    this.committedAudits = [];
    this.committedOutbox = [];
  }
}
