/**
 * Validated JSON Fixture Incident Repository Adapter (Lecture 4: Hexagonal Ports & Adapters)
 * Seeded from validated JSON fixture data with strict schema checks, copy-on-write
 * deep-cloned isolation, expectedVersion CAS, and atomic command idempotency.
 *
 * Capabilities honestly stated:
 * - Validates every seed record on initialization (rejects malformed JSON/fields).
 * - Enforces identical compare-and-swap and idempotency semantics as InMemory & Postgres.
 * - Isolated in-memory store; switching adapters in demo mode does NOT migrate data.
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
  InvalidIncidentDataError,
  OptimisticConcurrencyError,
  deepCloneIncident,
  validateIncidentRecord,
} from '../ports/IncidentPort.js';
import type { AuditEvent } from '../ports/AuditPort.js';

export const INITIAL_FIXTURE_INCIDENTS: Incident[] = [
  {
    incidentId: 'INC-2026-YAS-001',
    dmaId: 'DMA-YASAMAL-04',
    pipeSegmentId: 'PIPE-YAS-4412',
    title: 'H. Cavid prospekti Ø200mm Asbest-Sement Boru Qəzası',
    detectedAt: new Date('2026-10-20T02:45:00+04:00'),
    state: 'DETECTED',
    severity: 'CRITICAL',
    estimatedLossM3h: 38.4,
    version: 1,
  },
  {
    incidentId: 'INC-2026-SAB-003',
    dmaId: 'DMA-SABAIL-01',
    pipeSegmentId: 'PIPE-SAB-0312',
    title: 'İçərişəhər Tarixi Boru Kəməri Sızması',
    detectedAt: new Date('2026-10-19T14:20:00+04:00'),
    state: 'VERIFIED',
    severity: 'LOW',
    estimatedLossM3h: 8.5,
    crewAssignment: {
      crewId: 'CREW-BAKU-SPEC',
      crewName: 'Tarixi Şəbəkə Xüsusi Briqadası',
      crewPhone: '+994 70 333-22-11',
      role: 'Mühəndis: Elvin Qasımov',
      etaMinutes: 15,
      assignedAt: new Date('2026-10-19T14:40:00+04:00'),
      assignedBy: 'dispatcher-baku-01',
    },
    repairEvidence: {
      technicianId: 'TECH-774',
      repairMethod: 'Kompozit Klemma Quraşdırılması (Ø150mm)',
      clampType: 'Mufta Kraun Ø150',
      acousticFreqHz: 16,
      photoFixtureRef: 'fixture://photos/repair-sab-0312.webp',
      completedAt: new Date('2026-10-19T17:30:00+04:00'),
      technicianNotes: 'Klemma təzyiq altında bərkidildi, sızma dayandırıldı.',
      recordedBy: 'dispatcher-baku-01',
    },
    verificationResult: {
      evaluatedAt: new Date('2026-10-20T03:30:00+04:00'),
      evaluatedBy: 'dispatcher-baku-01',
      outcome: 'VERIFIED_SYNTHETIC_POLICY',
      preRepairMnfM3h: 34.5,
      postRepairMnfM3h: 26.0,
      pressureNormalizedPreMnfM3h: 34.5,
      baselineMnfM3h: 25.5,
      verifiedLossDropM3h: 8.5,
      isSuccessful: true,
      policyLabel: 'Synthetic verification under SAMT v1.1.0 policy (not field-measured physical repair certification)',
      assumptions: ['Comparable operating pressure assumed across synthetic fixture windows'],
      reason: 'Post-repair MNF returned to within synthetic baseline tolerance envelope',
    },
    version: 4,
  },
];

export class ValidatedJsonFixtureIncidentRepository implements IIncidentRepository {
  private inMemoryCache = new Map<string, Incident>();
  private commands = new Map<string, StoredCommandOutcome>();
  private committedAudits: AuditEvent[] = [];
  private committedOutbox: CommandOutboxMessage[] = [];

  constructor(seedInput: Incident[] | string = INITIAL_FIXTURE_INCIDENTS) {
    let parsed: unknown;
    if (typeof seedInput === 'string') {
      try {
        parsed = JSON.parse(seedInput);
      } catch (err) {
        throw new InvalidIncidentDataError(
          `Malformed JSON seed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      parsed = JSON.parse(JSON.stringify(seedInput));
    }

    if (!Array.isArray(parsed)) {
      throw new InvalidIncidentDataError('JSON fixture seed must be an array of incident records');
    }

    for (const raw of parsed) {
      const validated = validateIncidentRecord(raw);
      if (this.inMemoryCache.has(validated.incidentId)) {
        throw new DuplicateIncidentError(validated.incidentId);
      }
      this.inMemoryCache.set(validated.incidentId, deepCloneIncident(validated));
    }
  }

  async getById(id: string): Promise<Incident | undefined> {
    const item = this.inMemoryCache.get(id);
    return item ? deepCloneIncident(item) : undefined;
  }

  async getAll(): Promise<Incident[]> {
    return Array.from(this.inMemoryCache.values())
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
    if (this.inMemoryCache.has(validated.incidentId)) {
      throw new DuplicateIncidentError(validated.incidentId);
    }
    this.inMemoryCache.set(validated.incidentId, deepCloneIncident(validated));
  }

  async update(incident: Incident, expectedVersion: number): Promise<void> {
    const validated = validateIncidentRecord(incident);
    const existing = this.inMemoryCache.get(validated.incidentId);
    if (!existing) {
      throw new IncidentNotFoundError(validated.incidentId);
    }
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new OptimisticConcurrencyError(validated.incidentId, expectedVersion, existing.version);
    }
    if (existing.version !== expectedVersion || validated.version !== expectedVersion + 1) {
      throw new OptimisticConcurrencyError(validated.incidentId, expectedVersion, existing.version);
    }
    this.inMemoryCache.set(validated.incidentId, deepCloneIncident(validated));
  }

  async getCommandOutcome(commandId: string): Promise<StoredCommandOutcome | undefined> {
    const found = this.commands.get(commandId);
    return found ? structuredClone(found) : undefined;
  }

  async commitCommand(request: AtomicCommandRequest): Promise<AtomicCommandResult> {
    const prior = this.commands.get(request.commandId);
    if (prior) {
      if (prior.payloadHash !== request.payloadHash || prior.incidentId !== request.incidentId) {
        throw new IdempotencyConflictError(request.commandId);
      }
      const latest = this.inMemoryCache.get(request.incidentId);
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

    const existing = this.inMemoryCache.get(request.incidentId);
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

    const prevIncident = deepCloneIncident(existing);
    const prevAuditLen = this.committedAudits.length;
    const prevOutboxLen = this.committedOutbox.length;

    try {
      this.inMemoryCache.set(validatedNext.incidentId, deepCloneIncident(validatedNext));
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
      this.inMemoryCache.set(prevIncident.incidentId, prevIncident);
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
}
