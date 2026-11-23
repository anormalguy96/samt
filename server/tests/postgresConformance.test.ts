import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createDbPool, type DbPool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { resetOperationalTables, seedDatabase } from '../src/db/seed.js';
import { PostgresIncidentRepository } from '../src/repositories/PostgresIncidentRepository.js';
import { PostgresAuditAndAllocationRepository } from '../src/repositories/PostgresAuditAndAllocationRepository.js';
import { FixedClock } from '../../prototype/src/domain/ports/Clock.js';
import {
  DuplicateIncidentError,
  IncidentNotFoundError,
  OptimisticConcurrencyError,
  type Incident,
} from '../../prototype/src/domain/ports/IncidentPort.js';
import { ExecuteIncidentTransitionUseCase } from '../../prototype/src/application/ExecuteIncidentTransitionUseCase.js';

describe('PostgresIncidentRepository Conformance, Concurrency, Idempotency & Atomic Rollback', () => {
  const config = loadConfig();
  let pool: DbPool;
  let repo: PostgresIncidentRepository;
  let auditRepo: PostgresAuditAndAllocationRepository;
  let clock: FixedClock;

  beforeAll(async () => {
    pool = createDbPool(config.databaseUrl, 10);
    await runMigrations(pool);
    await seedDatabase(pool);
    repo = new PostgresIncidentRepository(pool);
    auditRepo = new PostgresAuditAndAllocationRepository(pool);
  });

  beforeEach(async () => {
    await resetOperationalTables(pool);
    clock = new FixedClock('2026-10-20T03:00:00+04:00');
  });

  afterAll(async () => {
    await pool.end();
  });

  const makeIncident = (id: string, dmaId = 'DMA-YASAMAL-04'): Incident => ({
    incidentId: id,
    dmaId,
    title: `PG Incident ${id}`,
    detectedAt: new Date('2026-10-20T03:00:00Z'),
    state: 'DETECTED',
    severity: 'CRITICAL',
    estimatedLossM3h: 35.5,
    version: 1,
  });

  it('enforces save, duplicate create rejection, missing update rejection, and strict CAS', async () => {
    const inc = makeIncident('INC-PG-CAS-01');
    await repo.save(inc);
    await expect(repo.save(inc)).rejects.toThrow(DuplicateIncidentError);

    const missing = makeIncident('INC-PG-MISSING');
    await expect(repo.update({ ...missing, version: 2 }, 1)).rejects.toThrow(IncidentNotFoundError);

    // Same-version update rejected
    await expect(repo.update({ ...inc, state: 'ASSIGNED', version: 1 }, 1)).rejects.toThrow(
      OptimisticConcurrencyError
    );

    // Valid v1 -> v2 succeeds
    await repo.update({ ...inc, state: 'ASSIGNED', version: 2 }, 1);
    const reloaded = await repo.getById(inc.incidentId);
    expect(reloaded?.state).toBe('ASSIGNED');
    expect(reloaded?.version).toBe(2);

    // Stale v1 rejected
    await expect(repo.update({ ...inc, state: 'IN_REPAIR', version: 2 }, 1)).rejects.toThrow(
      OptimisticConcurrencyError
    );
  });

  it('handles two concurrent PostgreSQL writers with same expectedVersion: 1 succeeds, 1 conflicts (409), 1 audit', async () => {
    const inc = makeIncident('INC-PG-RACE-01');
    await repo.save(inc);
    const uc = new ExecuteIncidentTransitionUseCase(repo, clock);

    const [r1, r2] = await Promise.all([
      uc.execute({
        incidentId: inc.incidentId,
        commandId: 'cmd-pg-race-a',
        expectedVersion: 1,
        actor: { actorId: 'disp-a', role: 'dispatcher' },
        event: {
          type: 'ASSIGN',
          crew: { crewId: 'C1', crewName: 'Crew A', crewPhone: '+994-1', role: 'Lead', etaMinutes: 15 },
        },
      }),
      uc.execute({
        incidentId: inc.incidentId,
        commandId: 'cmd-pg-race-b',
        expectedVersion: 1,
        actor: { actorId: 'disp-b', role: 'dispatcher' },
        event: {
          type: 'ASSIGN',
          crew: { crewId: 'C2', crewName: 'Crew B', crewPhone: '+994-2', role: 'Lead', etaMinutes: 25 },
        },
      }),
    ]);

    const okList = [r1, r2].filter((r) => r.ok);
    const conflictList = [r1, r2].filter((r) => !r.ok && r.statusCode === 409);
    expect(okList).toHaveLength(1);
    expect(conflictList).toHaveLength(1);

    const persisted = await repo.getById(inc.incidentId);
    expect(persisted?.version).toBe(2);
    expect(persisted?.state).toBe('ASSIGNED');

    const audits = await auditRepo.listAuditEvents({ incidentId: inc.incidentId });
    expect(audits).toHaveLength(1);
  });

  it('persists commandId idempotency across a fresh pool/restart and rejects payload mismatch with 409', async () => {
    const inc = makeIncident('INC-PG-IDEM-01');
    await repo.save(inc);
    const uc1 = new ExecuteIncidentTransitionUseCase(repo, clock);

    const first = await uc1.execute({
      incidentId: inc.incidentId,
      commandId: 'cmd-pg-restart-1',
      expectedVersion: 1,
      actor: { actorId: 'disp-1', role: 'dispatcher' },
      event: {
        type: 'ASSIGN',
        crew: { crewId: 'C1', crewName: 'Crew Restart', crewPhone: '+994-50', role: 'Lead', etaMinutes: 20 },
      },
    });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.idempotentReplay).toBe(false);

    // Simulate process restart with brand new DB pool and fresh repository + use-case instances
    const freshPool = createDbPool(config.databaseUrl, 4);
    try {
      const freshRepo = new PostgresIncidentRepository(freshPool);
      const uc2 = new ExecuteIncidentTransitionUseCase(freshRepo, clock);

      const replay = await uc2.execute({
        incidentId: inc.incidentId,
        commandId: 'cmd-pg-restart-1',
        expectedVersion: 1,
        actor: { actorId: 'disp-1', role: 'dispatcher' },
        event: {
          type: 'ASSIGN',
          crew: { crewId: 'C1', crewName: 'Crew Restart', crewPhone: '+994-50', role: 'Lead', etaMinutes: 20 },
        },
      });
      expect(replay.ok).toBe(true);
      if (replay.ok) {
        expect(replay.idempotentReplay).toBe(true);
        expect(replay.incident.version).toBe(2);
      }

      // Same commandId with DIFFERENT crew payload -> 409 IDEMPOTENCY_CONFLICT
      const conflict = await uc2.execute({
        incidentId: inc.incidentId,
        commandId: 'cmd-pg-restart-1',
        expectedVersion: 1,
        actor: { actorId: 'disp-1', role: 'dispatcher' },
        event: {
          type: 'ASSIGN',
          crew: { crewId: 'C9', crewName: 'Evil Crew', crewPhone: '+994-99', role: 'Lead', etaMinutes: 90 },
        },
      });
      expect(conflict.ok).toBe(false);
      if (!conflict.ok) {
        expect(conflict.statusCode).toBe(409);
        expect(conflict.errorCode).toBe('IDEMPOTENCY_CONFLICT');
      }

      // Confirm only 1 audit event was written across both calls
      const audits = await auditRepo.listAuditEvents({ incidentId: inc.incidentId });
      expect(audits).toHaveLength(1);
    } finally {
      await freshPool.end();
    }
  });

  it('rolls back incident, version, audit, command ledger, and outbox atomically on injected pre-commit failure and permits clean retry', async () => {
    const inc = makeIncident('INC-PG-ROLLBACK-01');
    await repo.save(inc);
    const uc = new ExecuteIncidentTransitionUseCase(repo, clock);

    await expect(
      uc.execute({
        incidentId: inc.incidentId,
        commandId: 'cmd-pg-rb-1',
        expectedVersion: 1,
        actor: { actorId: 'disp-1', role: 'dispatcher' },
        event: {
          type: 'ASSIGN',
          crew: { crewId: 'C1', crewName: 'Crew RB', crewPhone: '+994-55', role: 'Lead', etaMinutes: 15 },
        },
        beforeCommitHook: () => {
          throw new Error('Injected SQL pre-commit crash');
        },
      })
    ).rejects.toThrow('Injected SQL pre-commit crash');

    // Verify complete atomic rollback across ALL four tables!
    const afterCrash = await repo.getById(inc.incidentId);
    expect(afterCrash?.state).toBe('DETECTED');
    expect(afterCrash?.version).toBe(1);
    expect(await auditRepo.listAuditEvents({ incidentId: inc.incidentId })).toHaveLength(0);
    expect(await repo.getCommandOutcome('cmd-pg-rb-1')).toBeUndefined();
    const outboxCnt = await pool.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM notification_outbox');
    expect(Number(outboxCnt.rows[0].cnt)).toBe(0);

    // Retry exact same commandId now succeeds and commits all four records atomically
    const retry = await uc.execute({
      incidentId: inc.incidentId,
      commandId: 'cmd-pg-rb-1',
      expectedVersion: 1,
      actor: { actorId: 'disp-1', role: 'dispatcher' },
      event: {
        type: 'ASSIGN',
        crew: { crewId: 'C1', crewName: 'Crew RB', crewPhone: '+994-55', role: 'Lead', etaMinutes: 15 },
      },
    });
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      expect(retry.incident.state).toBe('ASSIGNED');
      expect(retry.incident.version).toBe(2);
    }
    expect(await auditRepo.listAuditEvents({ incidentId: inc.incidentId })).toHaveLength(1);
    const outboxAfter = await pool.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM notification_outbox');
    expect(Number(outboxAfter.rows[0].cnt)).toBe(1);
  });
});
