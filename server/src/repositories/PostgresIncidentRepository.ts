/**
 * PostgreSQL Incident Repository Adapter (SAMT v1.1.0)
 * Implements IIncidentRepository + IIncidentCreationStore against standard PostgreSQL 16.
 *
 * Guarantees (single-database ACID):
 * - Explicit expectedVersion compare-and-swap (UPDATE ... WHERE incident_id = $1 AND version = $2).
 * - Atomic transaction committing incident mutation, command idempotency record,
 *   audit event, and optional notification outbox row together (all or nothing).
 * - Deterministic list ordering: detected_at DESC, incident_id ASC.
 * - Validated deserialization of JSONB evidence payloads via validateIncidentRecord.
 */

import type { DbPool } from '../db/pool.js';
import type {
  AtomicCommandRequest,
  AtomicCommandResult,
  CommandOutboxMessage,
  IIncidentRepository,
  Incident,
  StoredCommandOutcome,
} from '../../../prototype/src/domain/ports/IncidentPort.js';
import {
  DuplicateIncidentError,
  IdempotencyConflictError,
  IncidentNotFoundError,
  OptimisticConcurrencyError,
  deepCloneIncident,
  validateIncidentRecord,
} from '../../../prototype/src/domain/ports/IncidentPort.js';
import type { AuditEvent } from '../../../prototype/src/domain/ports/AuditPort.js';
import type { IIncidentCreationStore } from '../../../prototype/src/application/AssessDmaHydraulicsUseCase.js';

interface IncidentRow {
  incident_id: string;
  dma_id: string;
  pipe_segment_id: string | null;
  title: string;
  state: string;
  severity: string;
  estimated_loss_m3h: number;
  detected_at: Date;
  crew_assignment: Record<string, unknown> | null;
  repair_evidence: Record<string, unknown> | null;
  verification_result: Record<string, unknown> | null;
  closed_at: Date | null;
  closed_by: string | null;
  false_alarm_reason: string | null;
  version: number;
}

function mapRowToIncident(row: IncidentRow): Incident {
  return validateIncidentRecord({
    incidentId: row.incident_id,
    dmaId: row.dma_id,
    pipeSegmentId: row.pipe_segment_id ?? undefined,
    title: row.title,
    state: row.state,
    severity: row.severity,
    estimatedLossM3h: Number(row.estimated_loss_m3h),
    detectedAt: new Date(row.detected_at),
    crewAssignment: row.crew_assignment ?? undefined,
    repairEvidence: row.repair_evidence ?? undefined,
    verificationResult: row.verification_result ?? undefined,
    closedAt: row.closed_at ? new Date(row.closed_at) : undefined,
    closedBy: row.closed_by ?? undefined,
    falseAlarmReason: row.false_alarm_reason ?? undefined,
    version: Number(row.version),
  });
}

function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export class PostgresIncidentRepository implements IIncidentRepository, IIncidentCreationStore {
  constructor(private pool: DbPool) {}

  async getById(id: string): Promise<Incident | undefined> {
    const res = await this.pool.query<IncidentRow>(
      `
      SELECT incident_id, dma_id, pipe_segment_id, title, state, severity,
             estimated_loss_m3h, detected_at, crew_assignment, repair_evidence,
             verification_result, closed_at, closed_by, false_alarm_reason, version
      FROM leak_incidents
      WHERE incident_id = $1
      `,
      [id]
    );
    return res.rows[0] ? mapRowToIncident(res.rows[0]) : undefined;
  }

  async getAll(filter?: { dmaId?: string; state?: string }): Promise<Incident[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.dmaId) {
      params.push(filter.dmaId);
      conditions.push(`dma_id = $${params.length}`);
    }
    if (filter?.state) {
      params.push(filter.state);
      conditions.push(`state = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const res = await this.pool.query<IncidentRow>(
      `
      SELECT incident_id, dma_id, pipe_segment_id, title, state, severity,
             estimated_loss_m3h, detected_at, crew_assignment, repair_evidence,
             verification_result, closed_at, closed_by, false_alarm_reason, version
      FROM leak_incidents
      ${where}
      ORDER BY detected_at DESC, incident_id ASC
      `,
      params
    );
    return res.rows.map(mapRowToIncident);
  }

  async getByDma(dmaId: string): Promise<Incident[]> {
    return this.getAll({ dmaId });
  }

  async getActiveIncidentsByDma(dmaId: string): Promise<Incident[]> {
    const res = await this.pool.query<IncidentRow>(
      `
      SELECT incident_id, dma_id, pipe_segment_id, title, state, severity,
             estimated_loss_m3h, detected_at, crew_assignment, repair_evidence,
             verification_result, closed_at, closed_by, false_alarm_reason, version
      FROM leak_incidents
      WHERE dma_id = $1 AND state NOT IN ('CLOSED', 'FALSE_ALARM')
      ORDER BY detected_at DESC, incident_id ASC
      `,
      [dmaId]
    );
    return res.rows.map(mapRowToIncident);
  }

  async save(incident: Incident): Promise<void> {
    const validated = validateIncidentRecord(incident);
    try {
      await this.pool.query(
        `
        INSERT INTO leak_incidents (
          incident_id, dma_id, pipe_segment_id, title, state, severity,
          estimated_loss_m3h, detected_at, crew_assignment, repair_evidence,
          verification_result, closed_at, closed_by, false_alarm_reason, version
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `,
        [
          validated.incidentId,
          validated.dmaId,
          validated.pipeSegmentId ?? null,
          validated.title,
          validated.state,
          validated.severity,
          validated.estimatedLossM3h,
          validated.detectedAt.toISOString(),
          validated.crewAssignment ? JSON.stringify(validated.crewAssignment) : null,
          validated.repairEvidence ? JSON.stringify(validated.repairEvidence) : null,
          validated.verificationResult ? JSON.stringify(validated.verificationResult) : null,
          validated.closedAt ? validated.closedAt.toISOString() : null,
          validated.closedBy ?? null,
          validated.falseAlarmReason ?? null,
          validated.version,
        ]
      );
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        throw new DuplicateIncidentError(validated.incidentId);
      }
      throw err;
    }
  }

  async update(incident: Incident, expectedVersion: number): Promise<void> {
    const validated = validateIncidentRecord(incident);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new OptimisticConcurrencyError(validated.incidentId, expectedVersion, 0);
    }
    if (validated.version !== expectedVersion + 1) {
      const existing = await this.getById(validated.incidentId);
      if (!existing) throw new IncidentNotFoundError(validated.incidentId);
      throw new OptimisticConcurrencyError(validated.incidentId, expectedVersion, existing.version);
    }

    const res = await this.pool.query(
      `
      UPDATE leak_incidents
      SET state = $2,
          severity = $3,
          estimated_loss_m3h = $4,
          crew_assignment = $5,
          repair_evidence = $6,
          verification_result = $7,
          closed_at = $8,
          closed_by = $9,
          false_alarm_reason = $10,
          version = $11,
          updated_at = NOW()
      WHERE incident_id = $1 AND version = $12
      `,
      [
        validated.incidentId,
        validated.state,
        validated.severity,
        validated.estimatedLossM3h,
        validated.crewAssignment ? JSON.stringify(validated.crewAssignment) : null,
        validated.repairEvidence ? JSON.stringify(validated.repairEvidence) : null,
        validated.verificationResult ? JSON.stringify(validated.verificationResult) : null,
        validated.closedAt ? validated.closedAt.toISOString() : null,
        validated.closedBy ?? null,
        validated.falseAlarmReason ?? null,
        validated.version,
        expectedVersion,
      ]
    );

    if (res.rowCount === 0) {
      const existing = await this.getById(validated.incidentId);
      if (!existing) {
        throw new IncidentNotFoundError(validated.incidentId);
      }
      throw new OptimisticConcurrencyError(validated.incidentId, expectedVersion, existing.version);
    }
  }

  async createIncidentAtomic(
    incident: Incident,
    auditEvent: AuditEvent,
    outboxMessage?: CommandOutboxMessage
  ): Promise<Incident> {
    const validated = validateIncidentRecord(incident);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `
        INSERT INTO leak_incidents (
          incident_id, dma_id, pipe_segment_id, title, state, severity,
          estimated_loss_m3h, detected_at, crew_assignment, repair_evidence,
          verification_result, closed_at, closed_by, false_alarm_reason, version
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `,
        [
          validated.incidentId,
          validated.dmaId,
          validated.pipeSegmentId ?? null,
          validated.title,
          validated.state,
          validated.severity,
          validated.estimatedLossM3h,
          validated.detectedAt.toISOString(),
          validated.crewAssignment ? JSON.stringify(validated.crewAssignment) : null,
          validated.repairEvidence ? JSON.stringify(validated.repairEvidence) : null,
          validated.verificationResult ? JSON.stringify(validated.verificationResult) : null,
          validated.closedAt ? validated.closedAt.toISOString() : null,
          validated.closedBy ?? null,
          validated.falseAlarmReason ?? null,
          validated.version,
        ]
      );

      await client.query(
        `
        INSERT INTO audit_events (
          audit_id, event_timestamp, event_type, source_component, severity,
          actor_id, actor_role, correlation_id, dma_id, incident_id, message, metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `,
        [
          auditEvent.id,
          auditEvent.timestamp.toISOString(),
          auditEvent.eventType,
          auditEvent.sourceComponent,
          auditEvent.severity,
          auditEvent.actorId ?? 'system',
          auditEvent.actorRole ?? 'system',
          auditEvent.correlationId ?? 'n/a',
          auditEvent.dmaId ?? validated.dmaId,
          validated.incidentId,
          auditEvent.message,
          auditEvent.metadata ? JSON.stringify(auditEvent.metadata) : null,
        ]
      );

      if (outboxMessage) {
        await client.query(
          `
          INSERT INTO notification_outbox (
            outbox_id, idempotency_key, incident_id, dma_id,
            recipient, severity, message, payload
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `,
          [
            outboxMessage.outboxId,
            outboxMessage.idempotencyKey,
            outboxMessage.incidentId,
            outboxMessage.dmaId,
            outboxMessage.recipient,
            outboxMessage.severity,
            outboxMessage.message,
            JSON.stringify(outboxMessage.payload),
          ]
        );
      }

      await client.query('COMMIT');
      return deepCloneIncident(validated);
    } catch (err) {
      await client.query('ROLLBACK');
      if (isPgUniqueViolation(err)) {
        throw new DuplicateIncidentError(validated.incidentId);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async getCommandOutcome(commandId: string): Promise<StoredCommandOutcome | undefined> {
    const res = await this.pool.query<{
      command_id: string;
      incident_id: string;
      payload_hash: string;
      response_status: number;
      response_body: Record<string, unknown>;
    }>(
      `
      SELECT command_id, incident_id, payload_hash, response_status, response_body
      FROM incident_commands
      WHERE command_id = $1
      `,
      [commandId]
    );
    const row = res.rows[0];
    if (!row) return undefined;
    return {
      commandId: row.command_id,
      incidentId: row.incident_id,
      payloadHash: row.payload_hash,
      responseStatus: Number(row.response_status),
      responseBody: row.response_body,
    };
  }

  async commitCommand(request: AtomicCommandRequest): Promise<AtomicCommandResult> {
    const validatedNext = validateIncidentRecord(request.nextIncident);
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Check command idempotency inside transaction
      const priorCmd = await client.query<{
        command_id: string;
        incident_id: string;
        payload_hash: string;
        response_status: number;
        response_body: Record<string, unknown>;
      }>(
        `
        SELECT command_id, incident_id, payload_hash, response_status, response_body
        FROM incident_commands
        WHERE command_id = $1
        `,
        [request.commandId]
      );

      if (priorCmd.rows[0]) {
        const prior = priorCmd.rows[0];
        if (prior.payload_hash !== request.payloadHash || prior.incident_id !== request.incidentId) {
          throw new IdempotencyConflictError(request.commandId);
        }
        const incRow = await client.query<IncidentRow>(
          `
          SELECT incident_id, dma_id, pipe_segment_id, title, state, severity,
                 estimated_loss_m3h, detected_at, crew_assignment, repair_evidence,
                 verification_result, closed_at, closed_by, false_alarm_reason, version
          FROM leak_incidents
          WHERE incident_id = $1
          `,
          [request.incidentId]
        );
        await client.query('COMMIT');
        if (!incRow.rows[0]) throw new IncidentNotFoundError(request.incidentId);
        return {
          idempotentReplay: true,
          responseStatus: Number(prior.response_status),
          responseBody: prior.response_body,
          incident: mapRowToIncident(incRow.rows[0]),
        };
      }

      // 2. Lock incident row & verify expectedVersion CAS
      const locked = await client.query<IncidentRow>(
        `
        SELECT incident_id, dma_id, pipe_segment_id, title, state, severity,
               estimated_loss_m3h, detected_at, crew_assignment, repair_evidence,
               verification_result, closed_at, closed_by, false_alarm_reason, version
        FROM leak_incidents
        WHERE incident_id = $1
        FOR UPDATE
        `,
        [request.incidentId]
      );

      if (!locked.rows[0]) {
        throw new IncidentNotFoundError(request.incidentId);
      }

      const currentVersion = Number(locked.rows[0].version);
      if (currentVersion !== request.expectedVersion) {
        throw new OptimisticConcurrencyError(
          request.incidentId,
          request.expectedVersion,
          currentVersion
        );
      }

      const isMutating = validatedNext.version !== currentVersion;
      if (isMutating && validatedNext.version !== request.expectedVersion + 1) {
        throw new OptimisticConcurrencyError(
          request.incidentId,
          request.expectedVersion,
          currentVersion
        );
      }

      if (isMutating) {
        const upd = await client.query(
          `
          UPDATE leak_incidents
          SET state = $2,
              severity = $3,
              estimated_loss_m3h = $4,
              crew_assignment = $5,
              repair_evidence = $6,
              verification_result = $7,
              closed_at = $8,
              closed_by = $9,
              false_alarm_reason = $10,
              version = $11,
              updated_at = NOW()
          WHERE incident_id = $1 AND version = $12
          `,
          [
            validatedNext.incidentId,
            validatedNext.state,
            validatedNext.severity,
            validatedNext.estimatedLossM3h,
            validatedNext.crewAssignment ? JSON.stringify(validatedNext.crewAssignment) : null,
            validatedNext.repairEvidence ? JSON.stringify(validatedNext.repairEvidence) : null,
            validatedNext.verificationResult ? JSON.stringify(validatedNext.verificationResult) : null,
            validatedNext.closedAt ? validatedNext.closedAt.toISOString() : null,
            validatedNext.closedBy ?? null,
            validatedNext.falseAlarmReason ?? null,
            validatedNext.version,
            request.expectedVersion,
          ]
        );
        if (upd.rowCount !== 1) {
          throw new OptimisticConcurrencyError(
            request.incidentId,
            request.expectedVersion,
            currentVersion
          );
        }
      }

      // 3. Record durable audit event inside the same transaction
      await client.query(
        `
        INSERT INTO audit_events (
          audit_id, event_timestamp, event_type, source_component, severity,
          actor_id, actor_role, correlation_id, dma_id, incident_id, message, metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `,
        [
          request.auditEvent.id,
          request.auditEvent.timestamp.toISOString(),
          request.auditEvent.eventType,
          request.auditEvent.sourceComponent,
          request.auditEvent.severity,
          request.actor.actorId,
          request.actor.role,
          request.auditEvent.correlationId ?? 'n/a',
          request.auditEvent.dmaId ?? validatedNext.dmaId,
          validatedNext.incidentId,
          request.auditEvent.message,
          request.auditEvent.metadata ? JSON.stringify(request.auditEvent.metadata) : null,
        ]
      );

      // 4. Optional transactional notification outbox entry
      if (request.outboxMessage) {
        await client.query(
          `
          INSERT INTO notification_outbox (
            outbox_id, idempotency_key, incident_id, dma_id,
            recipient, severity, message, payload
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (idempotency_key) DO NOTHING
          `,
          [
            request.outboxMessage.outboxId,
            request.outboxMessage.idempotencyKey,
            request.outboxMessage.incidentId,
            request.outboxMessage.dmaId,
            request.outboxMessage.recipient,
            request.outboxMessage.severity,
            request.outboxMessage.message,
            JSON.stringify(request.outboxMessage.payload),
          ]
        );
      }

      // 5. Record idempotent command outcome inside the same transaction
      await client.query(
        `
        INSERT INTO incident_commands (
          command_id, incident_id, actor_id, actor_role, event_type,
          expected_version, payload_hash, response_status, response_body
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          request.commandId,
          request.incidentId,
          request.actor.actorId,
          request.actor.role,
          request.eventType,
          request.expectedVersion,
          request.payloadHash,
          request.responseStatus,
          JSON.stringify(request.responseBody),
        ]
      );

      // 6. Optional failure injection seam prior to COMMIT to prove atomic rollback
      if (request.beforeCommitHook) {
        await request.beforeCommitHook();
      }

      await client.query('COMMIT');

      return {
        idempotentReplay: false,
        responseStatus: request.responseStatus,
        responseBody: structuredClone(request.responseBody),
        incident: deepCloneIncident(validatedNext),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      // Handle race where two identical command_ids arrived concurrently
      if (isPgUniqueViolation(err)) {
        const raced = await this.getCommandOutcome(request.commandId);
        if (raced) {
          if (raced.payloadHash !== request.payloadHash || raced.incidentId !== request.incidentId) {
            throw new IdempotencyConflictError(request.commandId);
          }
          const latest = await this.getById(request.incidentId);
          if (!latest) throw new IncidentNotFoundError(request.incidentId);
          return {
            idempotentReplay: true,
            responseStatus: raced.responseStatus,
            responseBody: raced.responseBody,
            incident: latest,
          };
        }
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
