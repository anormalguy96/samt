import { describe, it, expect, beforeEach } from 'vitest';
import type { IIncidentRepository, Incident } from '../domain/ports/IncidentPort';
import { InMemoryIncidentRepository } from '../domain/adapters/InMemoryIncidentRepository';
import { ValidatedJsonFixtureIncidentRepository } from '../domain/adapters/ValidatedJsonFixtureIncidentRepository';
import { RecordingAuditSink } from '../domain/adapters/RecordingAuditSink';

describe('Port Conformance & Interchangeable Adapters (Lecture 4: Hexagonal Architecture)', () => {
  // Test suite executed identically against both interchangeable repository implementations
  const runRepositoryContractTests = (name: string, createRepo: () => IIncidentRepository) => {
    describe(`Port Conformance for ${name}`, () => {
      let repo: IIncidentRepository;

      beforeEach(() => {
        repo = createRepo();
      });

      it('implements getById and save correctly', async () => {
        const testIncident: Incident = {
          incidentId: `INC-${name}-001`,
          dmaId: 'DMA-TEST-01',
          title: 'Adapter Conformance Incident',
          detectedAt: new Date('2026-10-20T03:00:00Z'),
          state: 'DETECTED',
          severity: 'HIGH' as any,
          estimatedLossM3h: 22.5,
          version: 1,
        };

        await repo.save(testIncident);
        const retrieved = await repo.getById(`INC-${name}-001`);

        expect(retrieved).toBeDefined();
        expect(retrieved?.incidentId).toBe(`INC-${name}-001`);
        expect(retrieved?.dmaId).toBe('DMA-TEST-01');
        expect(retrieved?.estimatedLossM3h).toBe(22.5);
      });

      it('implements getByDma filtering correctly', async () => {
        const inc1: Incident = {
          incidentId: `INC-${name}-YAS-1`,
          dmaId: 'DMA-YASAMAL-04',
          title: 'Yasamal Incident',
          detectedAt: new Date(),
          state: 'DETECTED',
          severity: 'CRITICAL',
          estimatedLossM3h: 30,
          version: 1,
        };
        const inc2: Incident = {
          incidentId: `INC-${name}-NAS-1`,
          dmaId: 'DMA-NASIMI-02',
          title: 'Nasimi Incident',
          detectedAt: new Date(),
          state: 'ASSIGNED',
          severity: 'LOW',
          estimatedLossM3h: 10,
          version: 1,
        };

        await repo.save(inc1);
        await repo.save(inc2);

        const yasamalIncidents = await repo.getByDma('DMA-YASAMAL-04');
        expect(yasamalIncidents.some((i) => i.incidentId === inc1.incidentId)).toBe(true);
        expect(yasamalIncidents.every((i) => i.dmaId === 'DMA-YASAMAL-04')).toBe(true);
      });

      it('implements update correctly', async () => {
        const inc: Incident = {
          incidentId: `INC-${name}-UPD`,
          dmaId: 'DMA-YASAMAL-04',
          title: 'Original Title',
          detectedAt: new Date(),
          state: 'DETECTED',
          severity: 'MEDIUM',
          estimatedLossM3h: 15,
          version: 1,
        };

        await repo.save(inc);
        const updated: Incident = {
          ...inc,
          state: 'ASSIGNED',
          version: 2,
        };

        await repo.update(updated);
        const retrieved = await repo.getById(`INC-${name}-UPD`);
        expect(retrieved?.state).toBe('ASSIGNED');
        expect(retrieved?.version).toBe(2);
      });
    });
  };

  // Run the exact same contract suite against both adapters:
  runRepositoryContractTests('InMemoryIncidentRepository', () => new InMemoryIncidentRepository());
  runRepositoryContractTests('ValidatedJsonFixtureIncidentRepository', () => new ValidatedJsonFixtureIncidentRepository([]));

  describe('RecordingAuditSink Test Double (Lecture 5: Test Spy)', () => {
    it('observes and records domain audit events accurately', () => {
      const auditSpy = new RecordingAuditSink();

      auditSpy.record({
        id: 'aud-001',
        timestamp: new Date('2026-10-20T03:00:00Z'),
        eventType: 'INCIDENT_ASSIGNED',
        sourceComponent: 'WorkOrderDispatcher',
        severity: 'INFO',
        message: 'Crew dispatched to Yasamal DMA-04',
      });

      expect(auditSpy.getEvents().length).toBe(1);
      expect(auditSpy.getEvents()[0].eventType).toBe('INCIDENT_ASSIGNED');
      expect(auditSpy.getEventsByType('INCIDENT_ASSIGNED').length).toBe(1);
    });

    it('records dispatch notifications for test assertions', async () => {
      const notifierSpy = new RecordingAuditSink();

      await notifierSpy.notify('CREW-LEAD-KAMRAN', 'Urgent burst at Yasamal DMA-04', 'CRITICAL');

      const notifications = notifierSpy.getNotifications();
      expect(notifications.length).toBe(1);
      expect(notifications[0].recipient).toBe('CREW-LEAD-KAMRAN');
      expect(notifications[0].severity).toBe('CRITICAL');
    });
  });
});
