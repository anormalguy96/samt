import http from 'node:http';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createDbPool, type DbPool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { resetOperationalTables, seedDatabase } from '../src/db/seed.js';
import { PostgresIncidentRepository } from '../src/repositories/PostgresIncidentRepository.js';
import {
  PostgresMeterRegistry,
  PostgresTelemetryRepository,
} from '../src/repositories/PostgresTelemetryRepository.js';
import { PostgresAuditAndAllocationRepository } from '../src/repositories/PostgresAuditAndAllocationRepository.js';
import {
  createHttpOutboxDelivery,
  OutboxDispatcher,
} from '../src/outbox/OutboxDispatcher.js';
import { LocalNotificationReceiver } from '../src/outbox/LocalNotificationReceiver.js';
import { createApp } from '../src/http/app.js';
import { FixedClock } from '../../prototype/src/domain/ports/Clock.js';
import { ExecuteIncidentTransitionUseCase } from '../../prototype/src/application/ExecuteIncidentTransitionUseCase.js';

describe('Transactional Outbox Retries & PostgreSQL Dependency Failure Recovery', () => {
  const config = loadConfig();
  let pool: DbPool;
  let incidentRepo: PostgresIncidentRepository;
  let meterRegistry: PostgresMeterRegistry;
  let telemetryRepo: PostgresTelemetryRepository;
  let auditRepo: PostgresAuditAndAllocationRepository;
  let clock: FixedClock;

  beforeAll(async () => {
    pool = createDbPool(config.databaseUrl, 8);
    await runMigrations(pool);
    await seedDatabase(pool);
    meterRegistry = new PostgresMeterRegistry(pool);
    await meterRegistry.refresh();
    telemetryRepo = new PostgresTelemetryRepository(pool);
    incidentRepo = new PostgresIncidentRepository(pool);
    auditRepo = new PostgresAuditAndAllocationRepository(pool);
  });

  beforeEach(async () => {
    await resetOperationalTables(pool);
    clock = new FixedClock('2026-10-20T03:00:00+04:00');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('retries failed notification outbox deliveries with bounded backoff and delivers idempotently once', async () => {
    const receiver = new LocalNotificationReceiver();
    receiver.setInjectedFailures(2); // First 2 HTTP attempts fail with 503; 3rd succeeds!
    const httpRecv = await receiver.startHttpServer(0);

    try {
      await incidentRepo.save({
        incidentId: 'INC-OUTBOX-01',
        dmaId: 'DMA-YASAMAL-04',
        title: 'Outbox Retry Test',
        detectedAt: clock.now(),
        state: 'DETECTED',
        severity: 'CRITICAL',
        estimatedLossM3h: 40,
        version: 1,
      });

      const uc = new ExecuteIncidentTransitionUseCase(incidentRepo, clock);
      const assigned = await uc.execute({
        incidentId: 'INC-OUTBOX-01',
        commandId: 'cmd-outbox-assign-1',
        expectedVersion: 1,
        actor: { actorId: 'disp-1', role: 'dispatcher' },
        event: {
          type: 'ASSIGN',
          crew: { crewId: 'C1', crewName: 'Crew 1', crewPhone: '+994-50', role: 'Lead', etaMinutes: 15 },
        },
      });
      expect(assigned.ok).toBe(true);

      const dispatcher = new OutboxDispatcher(pool, createHttpOutboxDelivery(httpRecv.url), 10);

      // Attempt 1: receiver fails (503) -> stays PENDING, attempts=1
      const s1 = await dispatcher.processDue({ ignoreSchedule: true });
      expect(s1.retried).toBe(1);
      expect(s1.delivered).toBe(0);

      // Attempt 2: receiver fails (503) -> stays PENDING, attempts=2
      const s2 = await dispatcher.processDue({ ignoreSchedule: true });
      expect(s2.retried).toBe(1);
      expect(s2.delivered).toBe(0);

      // Attempt 3: receiver succeeds (200) -> DELIVERED, attempts=3
      const s3 = await dispatcher.processDue({ ignoreSchedule: true });
      expect(s3.delivered).toBe(1);

      const rows = await dispatcher.listOutbox();
      expect(rows[0].status).toBe('DELIVERED');
      expect(rows[0].attempts).toBe(3);
      expect(receiver.getAttemptCount()).toBe(3);
      expect(receiver.getReceived()).toHaveLength(1);

      // Manual duplicate HTTP replay against receiver with same X-Idempotency-Key deduplicates cleanly
      const dupRes = await fetch(httpRecv.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': rows[0].idempotencyKey,
        },
        body: JSON.stringify({ outboxId: rows[0].outboxId }),
      });
      expect(dupRes.status).toBe(200);
      expect((await dupRes.json()).duplicate).toBe(true);
      expect(receiver.getReceived()).toHaveLength(1);
    } finally {
      await httpRecv.close();
    }
  });

  it('dead-letters outbox message after exhausting bounded max_attempts', async () => {
    const receiver = new LocalNotificationReceiver();
    receiver.setInjectedFailures(5); // Always fails beyond max_attempts (3)
    const httpRecv = await receiver.startHttpServer(0);

    try {
      await incidentRepo.save({
        incidentId: 'INC-OUTBOX-DLQ',
        dmaId: 'DMA-YASAMAL-04',
        title: 'Outbox DLQ Test',
        detectedAt: clock.now(),
        state: 'DETECTED',
        severity: 'CRITICAL',
        estimatedLossM3h: 40,
        version: 1,
      });

      const uc = new ExecuteIncidentTransitionUseCase(incidentRepo, clock);
      await uc.execute({
        incidentId: 'INC-OUTBOX-DLQ',
        commandId: 'cmd-outbox-dlq-1',
        expectedVersion: 1,
        actor: { actorId: 'disp-1', role: 'dispatcher' },
        event: {
          type: 'ASSIGN',
          crew: { crewId: 'C1', crewName: 'Crew 1', crewPhone: '+994-50', role: 'Lead', etaMinutes: 15 },
        },
      });

      const dispatcher = new OutboxDispatcher(pool, createHttpOutboxDelivery(httpRecv.url), 5);
      await dispatcher.processDue({ ignoreSchedule: true });
      await dispatcher.processDue({ ignoreSchedule: true });
      const s3 = await dispatcher.processDue({ ignoreSchedule: true });
      expect(s3.deadLettered).toBe(1);

      const rows = await dispatcher.listOutbox();
      expect(rows[0].status).toBe('DEAD_LETTERED');
      expect(rows[0].attempts).toBe(3);
      expect(rows[0].lastError).toContain('503');
    } finally {
      await httpRecv.close();
    }
  });

  it('degrades honestly with HTTP 503 when PostgreSQL is unavailable, never acknowledges lost writes, and recovers without duplicates', async () => {
    // Seed an incident in the real DB first
    await incidentRepo.save({
      incidentId: 'INC-DEP-FAIL-01',
      dmaId: 'DMA-YASAMAL-04',
      title: 'DB Outage Resilience Test',
      detectedAt: clock.now(),
      state: 'DETECTED',
      severity: 'CRITICAL',
      estimatedLossM3h: 35,
      version: 1,
    });

    // Spin up an Express server pointing at an unreachable PostgreSQL port (5499)
    const deadPool = createDbPool('postgresql://samt:samt@127.0.0.1:5499/samt_down', 2);
    const deadApp = createApp({
      config,
      pool: deadPool,
      meterRegistry, // Cached registry in memory so request reaches DB persistence layer
      telemetryRepo: new PostgresTelemetryRepository(deadPool),
      incidentRepo: new PostgresIncidentRepository(deadPool),
      auditRepo: new PostgresAuditAndAllocationRepository(deadPool),
      clock,
    });

    const deadServer: http.Server = await new Promise((resolve) => {
      const s = deadApp.listen(0, '127.0.0.1', () => resolve(s));
    });
    const deadPort = (deadServer.address() as { port: number }).port;
    const deadUrl = `http://127.0.0.1:${deadPort}`;

    try {
      // 1. Readiness check reports DEGRADED (503)
      const readyRes = await fetch(`${deadUrl}/ready`);
      expect(readyRes.status).toBe(503);
      expect((await readyRes.json()).status).toBe('DEGRADED');

      // 2. Telemetry write fails honestly with 503 (never acknowledged!)
      const telRes = await fetch(`${deadUrl}/v1/telemetry/batch`, {
        method: 'POST',
        headers: { 'X-Device-Token': 'samt-dev-device-yas-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway_id: 'GW-YAS-01',
          batch_timestamp: clock.now().toISOString(),
          measurements: [
            {
              observation_id: 'obs-during-outage',
              meter_id: 'FM-YAS-INLET-01',
              dma_id: 'DMA-YASAMAL-04',
              metric: 'FLOW_M3H',
              value: 45,
              observed_at: clock.now().toISOString(),
            },
          ],
        }),
      });
      expect(telRes.status).toBe(503);
      expect((await telRes.json()).error_code).toBe('DATABASE_UNAVAILABLE');

      // 3. Incident transition fails honestly with 503 (never acknowledged!)
      const trRes = await fetch(`${deadUrl}/v1/incidents/INC-DEP-FAIL-01/transition`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.dispatcherToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'ASSIGN',
          expected_version: 1,
          command_id: 'cmd-outage-retry-1',
          payload: {
            crew_id: 'C1',
            crew_name: 'Crew Recovery',
            crew_phone: '+994',
            role: 'Lead',
            eta_minutes: 15,
          },
        }),
      });
      expect(trRes.status).toBe(503);
    } finally {
      await new Promise<void>((resolve) => deadServer.close(() => resolve()));
      await deadPool.end();
    }

    // 4. Recovery: same command_id executes cleanly against healthy PostgreSQL with exactly 1 effect
    const healthyApp = createApp({
      config,
      pool,
      meterRegistry,
      telemetryRepo,
      incidentRepo,
      auditRepo,
      clock,
    });
    const healthyServer: http.Server = await new Promise((resolve) => {
      const s = healthyApp.listen(0, '127.0.0.1', () => resolve(s));
    });
    const healthyPort = (healthyServer.address() as { port: number }).port;
    const healthyUrl = `http://127.0.0.1:${healthyPort}`;

    try {
      const readyOk = await fetch(`${healthyUrl}/ready`);
      expect(readyOk.status).toBe(200);

      const recRes = await fetch(`${healthyUrl}/v1/incidents/INC-DEP-FAIL-01/transition`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.dispatcherToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'ASSIGN',
          expected_version: 1,
          command_id: 'cmd-outage-retry-1',
          payload: {
            crew_id: 'C1',
            crew_name: 'Crew Recovery',
            crew_phone: '+994',
            role: 'Lead',
            eta_minutes: 15,
          },
        }),
      });
      expect(recRes.status).toBe(200);
      const body = await recRes.json();
      expect(body.incident.state).toBe('ASSIGNED');
      expect(body.incident.version).toBe(2);
      expect(body.idempotent_replay).toBe(false);
    } finally {
      await new Promise<void>((resolve) => healthyServer.close(() => resolve()));
    }
  });
});
