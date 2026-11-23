/**
 * Local Idempotent Recording Notification Receiver (SAMT v1.1.0)
 * Deduplicates incoming notifications by `X-Idempotency-Key` and supports
 * controlled transient failure injection for automated outbox retry verification.
 */

import express from 'express';
import http from 'node:http';

export interface ReceivedNotification {
  idempotencyKey: string;
  outboxId: string;
  incidentId?: string | null;
  dmaId?: string | null;
  recipient: string;
  severity: string;
  message: string;
  payload: Record<string, unknown>;
  receivedAt: string;
}

export class LocalNotificationReceiver {
  private seenKeys = new Map<string, ReceivedNotification>();
  private deliveryAttempts = 0;
  private remainingInjectedFailures = 0;
  private server?: http.Server;

  setInjectedFailures(count: number): void {
    this.remainingInjectedFailures = Math.max(0, count);
  }

  getAttemptCount(): number {
    return this.deliveryAttempts;
  }

  getReceived(): ReceivedNotification[] {
    return Array.from(this.seenKeys.values());
  }

  clear(): void {
    this.seenKeys.clear();
    this.deliveryAttempts = 0;
    this.remainingInjectedFailures = 0;
  }

  handleDelivery(idempotencyKey: string, body: Record<string, unknown>): {
    status: number;
    duplicate: boolean;
    record?: ReceivedNotification;
  } {
    this.deliveryAttempts++;
    if (this.remainingInjectedFailures > 0) {
      this.remainingInjectedFailures--;
      return { status: 503, duplicate: false };
    }

    const existing = this.seenKeys.get(idempotencyKey);
    if (existing) {
      return { status: 200, duplicate: true, record: existing };
    }

    const record: ReceivedNotification = {
      idempotencyKey,
      outboxId: String(body.outboxId ?? ''),
      incidentId: (body.incidentId as string | null) ?? null,
      dmaId: (body.dmaId as string | null) ?? null,
      recipient: String(body.recipient ?? ''),
      severity: String(body.severity ?? 'INFO'),
      message: String(body.message ?? ''),
      payload: (body.payload as Record<string, unknown>) ?? {},
      receivedAt: new Date().toISOString(),
    };
    this.seenKeys.set(idempotencyKey, record);
    return { status: 200, duplicate: false, record };
  }

  async startHttpServer(port = 0): Promise<{ url: string; close: () => Promise<void> }> {
    const app = express();
    app.use(express.json({ limit: '256kb' }));
    app.post('/notify', (req, res) => {
      const key = req.header('X-Idempotency-Key')?.trim();
      if (!key) {
        res.status(400).json({ error: 'Missing X-Idempotency-Key header' });
        return;
      }
      const outcome = this.handleDelivery(key, req.body ?? {});
      if (outcome.status !== 200) {
        res.status(outcome.status).json({ error: 'Injected transient receiver failure' });
        return;
      }
      res.status(200).json({ status: 'RECEIVED', duplicate: outcome.duplicate });
    });

    await new Promise<void>((resolve) => {
      this.server = app.listen(port, '127.0.0.1', () => resolve());
    });
    const addr = this.server!.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : port;
    return {
      url: `http://127.0.0.1:${actualPort}/notify`,
      close: () =>
        new Promise<void>((resolve, reject) => {
          this.server?.close((err) => (err ? reject(err) : resolve()));
        }),
    };
  }
}
