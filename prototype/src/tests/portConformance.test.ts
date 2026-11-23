import { describe, it, expect, beforeEach } from 'vitest';
import type { IIncidentRepository, Incident } from '../domain/ports/IncidentPort';
import {
  DuplicateIncidentError,
  IdempotencyConflictError,
  IncidentNotFoundError,
  InvalidIncidentDataError,
  OptimisticConcurrencyError,
} from '../domain/ports/IncidentPort';
import { InMemoryIncidentRepository } from '../domain/adapters/InMemoryIncidentRepository';
import { ValidatedJsonFixtureIncidentRepository } from '../domain/adapters/ValidatedJsonFixtureIncidentRepository';
import { RecordingAuditSink } from '../domain/adapters/RecordingAuditSink';
import { FixedClock } from '../domain/ports/Clock';
import { ExecuteIncidentTransitionUseCase } from '../application/ExecuteIncidentTransitionUseCase';

describe('Port Conformance, Concurrency, Idempotency & Rollback (Lectures 4 & 5)', () => {
  const runRepositoryContractTests = (name: string, createRepo: () => IIncidentRepository) => {
    describe(`Port Conformance for ${name}`, () => {
      let repo: IIncidentRepository;
      let clock: FixedClock;

      beforeEach(() => {
        repo = createRepo();
        clock = new FixedClock('2026-10-20T03:00:00+04:00');
      });

      const makeIncident = (id: string, dmaId = 'DMA-YASAMAL-04'): Incident => ({
        incidentId: id,
        dmaId,
        title: `Incident ${id}`,
        detectedAt: new Date('2026-10-20T03:00:00Z'),
        state: 'DETECTED',
        severity: 'CRITICAL',
        estimatedLossM3h: 30,
        version: 1,
      });

      it('implements save, getById, duplicate save rejection, and missing update rejection', async () => {
        const inc = makeIncident(`INC-${name}-001`);
        await repo.save(inc);

        await expect(repo.save(inc)).rejects.toThrow(DuplicateIncidentError);

        const missing = makeIncident(`INC-${name}-MISSING`);
        await expect(repo.update({ ...missing, version: 2 }, 1)).rejects.toThrow(
          IncidentNotFoundError
        );
      });

      it('enforces strict expectedVersion CAS and rejects same-version and stale updates', async () => {
        const inc = makeIncident(`INC-${name}-CAS`);
        await repo.save(inc);

        // Same-version overwrite (old bug!) MUST be rejected
        await expect(repo.update({ ...inc, state: 'ASSIGNED', version: 1 }, 1)).rejects.toThrow(
          OptimisticConcurrencyError
        );

        // Valid v1 -> v2 succeeds
        await repo.update({ ...inc, state: 'ASSIGNED', version: 2 }, 1);

        // Stale update expecting v1 MUST fail with OptimisticConcurrencyError
        await expect(repo.update({ ...inc, state: 'IN_REPAIR', version: 2 }, 1)).rejects.toThrow(
          OptimisticConcurrencyError
        );
      });

      it('prevents caller mutation of stored nested objects (deep-clone isolation)', async () => {
        const inc: Incident = {
          ...makeIncident(`INC-${name}-IMMUT`),
          state: 'ASSIGNED',
          version: 2,
          crewAssignment: {
            crewId: 'C1',
            crewName: 'Original Crew',
            crewPhone: '+994',
            role: 'Lead',
            etaMinutes: 15,
            assignedAt: new Date('2026-10-20T03:05:00Z'),
          },
        };
        await repo.save(inc);

        // Mutate caller input after save
        inc.crewAssignment!.crewName = 'TAMPERED_INPUT';
        inc.detectedAt.setFullYear(1999);

        const retrieved = await repo.getById(inc.incidentId);
        expect(retrieved?.crewAssignment?.crewName).toBe('Original Crew');
        expect(retrieved?.detectedAt.getUTCFullYear()).toBe(2026);

        // Mutate retrieved nested object and verify stored copy is unaffected
        retrieved!.crewAssignment!.crewName = 'TAMPERED_RETRIEVED';
        const retrievedAgain = await repo.getById(inc.incidentId);
        expect(retrievedAgain?.crewAssignment?.crewName).toBe('Original Crew');
      });

      it('handles concurrent writers with same expectedVersion: 1 succeeds, 1 conflicts', async () => {
        const inc = makeIncident(`INC-${name}-RACE`);
        await repo.save(inc);
        const uc = new ExecuteIncidentTransitionUseCase(repo, clock);

        const [r1, r2] = await Promise.all([
          uc.execute({
            incidentId: inc.incidentId,
            commandId: `cmd-${name}-race-1`,
            expectedVersion: 1,
            actor: { actorId: 'disp-1', role: 'dispatcher' },
            event: {
              type: 'ASSIGN',
              crew: { crewId: 'C1', crewName: 'Crew A', crewPhone: '+994-1', role: 'Lead', etaMinutes: 15 },
            },
          }),
          uc.execute({
            incidentId: inc.incidentId,
            commandId: `cmd-${name}-race-2`,
            expectedVersion: 1,
            actor: { actorId: 'disp-2', role: 'dispatcher' },
            event: {
              type: 'ASSIGN',
              crew: { crewId: 'C2', crewName: 'Crew B', crewPhone: '+994-2', role: 'Lead', etaMinutes: 25 },
            },
          }),
        ]);

        const successes = [r1, r2].filter((r) => r.ok);
        const conflicts = [r1, r2].filter((r) => !r.ok && r.statusCode === 409);
        expect(successes).toHaveLength(1);
        expect(conflicts).toHaveLength(1);

        const stored = await repo.getById(inc.incidentId);
        expect(stored?.version).toBe(2);
      });

      it('enforces idempotent replay on duplicate commandId and 409 conflict on payload mismatch', async () => {
        const inc = makeIncident(`INC-${name}-IDEM`);
        await repo.save(inc);
        const uc = new ExecuteIncidentTransitionUseCase(repo, clock);

        const first = await uc.execute({
          incidentId: inc.incidentId,
          commandId: `cmd-${name}-stable-1`,
          expectedVersion: 1,
          actor: { actorId: 'disp-1', role: 'dispatcher' },
          event: {
            type: 'ASSIGN',
            crew: { crewId: 'C1', crewName: 'Crew A', crewPhone: '+994-1', role: 'Lead', etaMinutes: 20 },
          },
        });
        expect(first.ok).toBe(true);
        if (first.ok) expect(first.idempotentReplay).toBe(false);

        // Retry identical commandId + identical payload -> replays cleanly without incrementing version
        const replay = await uc.execute({
          incidentId: inc.incidentId,
          commandId: `cmd-${name}-stable-1`,
          expectedVersion: 1,
          actor: { actorId: 'disp-1', role: 'dispatcher' },
          event: {
            type: 'ASSIGN',
            crew: { crewId: 'C1', crewName: 'Crew A', crewPhone: '+994-1', role: 'Lead', etaMinutes: 20 },
          },
        });
        expect(replay.ok).toBe(true);
        if (replay.ok) {
          expect(replay.idempotentReplay).toBe(true);
          expect(replay.incident.version).toBe(2);
        }

        // Same commandId + DIFFERENT payload -> 409 IDEMPOTENCY_CONFLICT
        const mismatch = await uc.execute({
          incidentId: inc.incidentId,
          commandId: `cmd-${name}-stable-1`,
          expectedVersion: 1,
          actor: { actorId: 'disp-1', role: 'dispatcher' },
          event: {
            type: 'ASSIGN',
            crew: { crewId: 'C9', crewName: 'Different Crew', crewPhone: '+994-9', role: 'Lead', etaMinutes: 99 },
          },
        });
        expect(mismatch.ok).toBe(false);
        if (!mismatch.ok) {
          expect(mismatch.statusCode).toBe(409);
          expect(mismatch.errorCode).toBe('IDEMPOTENCY_CONFLICT');
        }
      });

      it('rolls back incident, version, and audit atomically on injected failure and allows retry', async () => {
        const inc = makeIncident(`INC-${name}-ROLLBACK`);
        await repo.save(inc);
        const uc = new ExecuteIncidentTransitionUseCase(repo, clock);

        await expect(
          uc.execute({
            incidentId: inc.incidentId,
            commandId: `cmd-${name}-rb-1`,
            expectedVersion: 1,
            actor: { actorId: 'disp-1', role: 'dispatcher' },
            event: {
              type: 'ASSIGN',
              crew: { crewId: 'C1', crewName: 'Crew A', crewPhone: '+994', role: 'Lead', etaMinutes: 15 },
            },
            beforeCommitHook: () => {
              throw new Error('Injected pre-commit persistence failure');
            },
          })
        ).rejects.toThrow('Injected pre-commit persistence failure');

        // Verify state and version remained untouched
        const afterFail = await repo.getById(inc.incidentId);
        expect(afterFail?.state).toBe('DETECTED');
        expect(afterFail?.version).toBe(1);

        // Retrying the exact same commandId now succeeds cleanly!
        const retry = await uc.execute({
          incidentId: inc.incidentId,
          commandId: `cmd-${name}-rb-1`,
          expectedVersion: 1,
          actor: { actorId: 'disp-1', role: 'dispatcher' },
          event: {
            type: 'ASSIGN',
            crew: { crewId: 'C1', crewName: 'Crew A', crewPhone: '+994', role: 'Lead', etaMinutes: 15 },
          },
        });
        expect(retry.ok).toBe(true);
        if (retry.ok) {
          expect(retry.idempotentReplay).toBe(false);
          expect(retry.incident.state).toBe('ASSIGNED');
          expect(retry.incident.version).toBe(2);
        }
      });
    });
  };

  runRepositoryContractTests('InMemoryIncidentRepository', () => new InMemoryIncidentRepository());
  runRepositoryContractTests(
    'ValidatedJsonFixtureIncidentRepository',
    () => new ValidatedJsonFixtureIncidentRepository([])
  );

  it('rejects malformed JSON seeds in ValidatedJsonFixtureIncidentRepository', () => {
    expect(() => new ValidatedJsonFixtureIncidentRepository('not-valid-json')).toThrow(
      InvalidIncidentDataError
    );
    expect(
      () =>
        new ValidatedJsonFixtureIncidentRepository(
          JSON.stringify([{ incidentId: 'BAD-1', dmaId: 'DMA-YASAMAL-04', state: 'BOGUS_STATE' }])
        )
    ).toThrow(InvalidIncidentDataError);
    expect(() => new ValidatedJsonFixtureIncidentRepository('{}')).toThrow(InvalidIncidentDataError);
  });

  it('RecordingAuditSink spy captures domain audit events and notifications', async () => {
    const spy = new RecordingAuditSink(new FixedClock('2026-10-20T03:00:00Z'));
    spy.record({
      id: 'aud-001',
      timestamp: new Date('2026-10-20T03:00:00Z'),
      eventType: 'INCIDENT_ASSIGNED',
      sourceComponent: 'WorkOrderDispatcher',
      severity: 'INFO',
      message: 'Crew dispatched',
    });
    await spy.notify('CREW-1', 'Urgent burst', 'CRITICAL');
    expect(spy.getEventsByType('INCIDENT_ASSIGNED')).toHaveLength(1);
    expect(spy.getNotifications()).toHaveLength(1);
    expect(IdempotencyConflictError).toBeDefined();
  });
});
