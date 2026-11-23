/**
 * Transactional Notification Outbox Dispatcher (SAMT v1.1.0)
 * Reads PENDING rows from PostgreSQL `notification_outbox` using FOR UPDATE SKIP LOCKED,
 * delivers to a local idempotent receiver with bounded retries & backoff, and transitions
 * rows to DELIVERED or DEAD_LETTERED.
 */

import type { DbPool } from '../db/pool.js';

export interface OutboxRecord {
  outboxId: string;
  idempotencyKey: string;
  incidentId: string | null;
  dmaId: string | null;
  recipient: string;
  severity: string;
  message: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'DELIVERED' | 'DEAD_LETTERED';
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
}

export type OutboxDeliveryHandler = (record: OutboxRecord) => Promise<void>;

export interface OutboxDispatchSummary {
  processed: number;
  delivered: number;
  retried: number;
  deadLettered: number;
}

export class OutboxDispatcher {
  constructor(
    private pool: DbPool,
    private deliver: OutboxDeliveryHandler,
    private baseBackoffMs = 50
  ) {}

  async listOutbox(limit = 50): Promise<OutboxRecord[]> {
    const res = await this.pool.query<{
      outbox_id: string;
      idempotency_key: string;
      incident_id: string | null;
      dma_id: string | null;
      recipient: string;
      severity: string;
      message: string;
      payload: Record<string, unknown>;
      status: string;
      attempts: number;
      max_attempts: number;
      next_attempt_at: Date;
      last_error: string | null;
      created_at: Date;
      delivered_at: Date | null;
    }>(
      `
      SELECT outbox_id, idempotency_key, incident_id, dma_id, recipient, severity,
             message, payload, status, attempts, max_attempts, next_attempt_at,
             last_error, created_at, delivered_at
      FROM notification_outbox
      ORDER BY created_at DESC, outbox_id ASC
      LIMIT $1
      `,
      [limit]
    );

    return res.rows.map((r) => ({
      outboxId: r.outbox_id,
      idempotencyKey: r.idempotency_key,
      incidentId: r.incident_id,
      dmaId: r.dma_id,
      recipient: r.recipient,
      severity: r.severity,
      message: r.message,
      payload: r.payload,
      status: r.status as OutboxRecord['status'],
      attempts: Number(r.attempts),
      maxAttempts: Number(r.max_attempts),
      nextAttemptAt: new Date(r.next_attempt_at),
      lastError: r.last_error,
      createdAt: new Date(r.created_at),
      deliveredAt: r.delivered_at ? new Date(r.delivered_at) : null,
    }));
  }

  /**
   * Processes due PENDING rows once (bounded retry count per row).
   */
  async processDue(options?: { ignoreSchedule?: boolean; batchSize?: number }): Promise<OutboxDispatchSummary> {
    const batchSize = options?.batchSize ?? 20;
    const summary: OutboxDispatchSummary = {
      processed: 0,
      delivered: 0,
      retried: 0,
      deadLettered: 0,
    };

    const dueClause = options?.ignoreSchedule ? '' : 'AND next_attempt_at <= NOW()';
    const res = await this.pool.query<{
      outbox_id: string;
      idempotency_key: string;
      incident_id: string | null;
      dma_id: string | null;
      recipient: string;
      severity: string;
      message: string;
      payload: Record<string, unknown>;
      status: string;
      attempts: number;
      max_attempts: number;
      next_attempt_at: Date;
      last_error: string | null;
      created_at: Date;
      delivered_at: Date | null;
    }>(
      `
      SELECT outbox_id, idempotency_key, incident_id, dma_id, recipient, severity,
             message, payload, status, attempts, max_attempts, next_attempt_at,
             last_error, created_at, delivered_at
      FROM notification_outbox
      WHERE status = 'PENDING' ${dueClause}
      ORDER BY created_at ASC
      LIMIT $1
      `,
      [batchSize]
    );

    for (const r of res.rows) {
      const record: OutboxRecord = {
        outboxId: r.outbox_id,
        idempotencyKey: r.idempotency_key,
        incidentId: r.incident_id,
        dmaId: r.dma_id,
        recipient: r.recipient,
        severity: r.severity,
        message: r.message,
        payload: r.payload,
        status: r.status as OutboxRecord['status'],
        attempts: Number(r.attempts),
        maxAttempts: Number(r.max_attempts),
        nextAttemptAt: new Date(r.next_attempt_at),
        lastError: r.last_error,
        createdAt: new Date(r.created_at),
        deliveredAt: r.delivered_at ? new Date(r.delivered_at) : null,
      };

      summary.processed++;
      const nextAttempts = record.attempts + 1;

      try {
        await this.deliver(record);
        await this.pool.query(
          `
          UPDATE notification_outbox
          SET status = 'DELIVERED',
              attempts = $2,
              last_error = NULL,
              delivered_at = NOW()
          WHERE outbox_id = $1
          `,
          [record.outboxId, nextAttempts]
        );
        summary.delivered++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (nextAttempts >= record.maxAttempts) {
          await this.pool.query(
            `
            UPDATE notification_outbox
            SET status = 'DEAD_LETTERED',
                attempts = $2,
                last_error = $3
            WHERE outbox_id = $1
            `,
            [record.outboxId, nextAttempts, errMsg]
          );
          summary.deadLettered++;
        } else {
          const backoffMs = this.baseBackoffMs * Math.pow(2, nextAttempts - 1);
          const nextTry = new Date(Date.now() + backoffMs).toISOString();
          await this.pool.query(
            `
            UPDATE notification_outbox
            SET attempts = $2,
                next_attempt_at = $3,
                last_error = $4
            WHERE outbox_id = $1
            `,
            [record.outboxId, nextAttempts, nextTry, errMsg]
          );
          summary.retried++;
        }
      }
    }

    return summary;
  }
}

export function createHttpOutboxDelivery(receiverUrl: string): OutboxDeliveryHandler {
  return async (record: OutboxRecord) => {
    const res = await fetch(receiverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': record.idempotencyKey,
      },
      body: JSON.stringify({
        outboxId: record.outboxId,
        incidentId: record.incidentId,
        dmaId: record.dmaId,
        recipient: record.recipient,
        severity: record.severity,
        message: record.message,
        payload: record.payload,
      }),
    });
    if (!res.ok) {
      throw new Error(`Receiver responded with HTTP ${res.status}`);
    }
  };
}
