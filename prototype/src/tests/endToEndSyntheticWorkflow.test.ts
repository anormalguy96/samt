import { describe, it, expect } from 'vitest';
import { FixedClock } from '../domain/ports/Clock';
import { StandardMeterRegistry } from '../domain/adapters/StandardMeterRegistry';
import { InMemoryIncidentRepository } from '../domain/adapters/InMemoryIncidentRepository';
import {
  IngestTelemetryBatchUseCase,
  type ITelemetryBatchPersistence,
} from '../application/IngestTelemetryBatchUseCase';
import {
  AssessDmaHydraulicsUseCase,
  type DmaMetadata,
  type IIncidentCreationStore,
  type ITelemetryQueryReader,
} from '../application/AssessDmaHydraulicsUseCase';
import { ExecuteIncidentTransitionUseCase } from '../application/ExecuteIncidentTransitionUseCase';
import type { TelemetryObservation } from '../domain/ports/TelemetryPort';
import type { AuditEvent } from '../domain/ports/AuditPort';
import type { CommandOutboxMessage, Incident } from '../domain/ports/IncidentPort';

describe('Connected Shared-Use-Case Synthetic Workflow (SAMT v1.1.0)', () => {
  it('runs shared use cases end-to-end with DMA isolation, historical replay guard, and authoritative verification', async () => {
    const clock = new FixedClock('2026-10-19T23:55:00Z'); // 03:55 AZT on 2026-10-20
    const registry = new StandardMeterRegistry();
    const incidentRepo = new InMemoryIncidentRepository();
    const storedObs: TelemetryObservation[] = [];
    const seenKeys = new Set<string>();
    const audits: AuditEvent[] = [];
    const outbox: CommandOutboxMessage[] = [];

    const persistence: ITelemetryBatchPersistence = {
      async persistObservations(observations, _corId, auditEvent) {
        const insertedObservationKeys = new Set<string>();
        const duplicateObservationKeys = new Set<string>();
        for (const obs of observations) {
          const k = `${obs.meterId}::${obs.observationId}`;
          if (seenKeys.has(k)) {
            duplicateObservationKeys.add(k);
          } else {
            seenKeys.add(k);
            storedObs.push(obs);
            insertedObservationKeys.add(k);
          }
        }
        if (auditEvent) audits.push(auditEvent);
        return { insertedObservationKeys, duplicateObservationKeys };
      },
    };

    const dmas = new Map<string, DmaMetadata>([
      [
        'DMA-YASAMAL-04',
        {
          dmaId: 'DMA-YASAMAL-04',
          name: 'Yasamal DMA-04',
          administrativeDistrict: 'Yasamal',
          baselineMnfM3h: 25.0,
          baselinePressureBar: 4.0,
          expectedSampleIntervalSec: 15,
        },
      ],
      [
        'DMA-NASIMI-02',
        {
          dmaId: 'DMA-NASIMI-02',
          name: 'Nasimi DMA-02',
          administrativeDistrict: 'Nasimi',
          baselineMnfM3h: 34.0,
          baselinePressureBar: 4.0,
          expectedSampleIntervalSec: 15,
        },
      ],
    ]);

    const reader: ITelemetryQueryReader = {
      async getDma(dmaId) {
        return dmas.get(dmaId);
      },
      async getFlowObservationsForDma(dmaId, from, to, options) {
        return storedObs.filter(
          (o) =>
            o.dmaId === dmaId &&
            o.metric === 'FLOW_M3H' &&
            o.observedAt >= from &&
            o.observedAt <= to &&
            (!options?.excludeHistoricalReplay || o.ingestionMode === 'LIVE')
        );
      },
    };

    const creator: IIncidentCreationStore = {
      async getActiveIncidentsByDma(dmaId) {
        return (await incidentRepo.getByDma(dmaId)).filter(
          (i) => i.state !== 'CLOSED' && i.state !== 'FALSE_ALARM'
        );
      },
      async createIncidentAtomic(incident: Incident, auditEvent, outboxMessage) {
        await incidentRepo.save(incident);
        audits.push(auditEvent);
        if (outboxMessage) outbox.push(outboxMessage);
        return incident;
      },
    };

    const ingestUc = new IngestTelemetryBatchUseCase(clock, registry, persistence);
    const assessUc = new AssessDmaHydraulicsUseCase(clock, registry, reader, creator);
    const transitionUc = new ExecuteIncidentTransitionUseCase(incidentRepo, clock);

    // 1. Ingest bounded historical replay (10 samples 12h ago) -> persisted, MUST NOT create live incident!
    const histStart = new Date(clock.now().getTime() - 24 * 3600 * 1000); // Previous night [02:00..03:50 AZT]
    const histBatch = await ingestUc.execute({
      authenticatedDeviceId: 'GW-YAS-01',
      actorRole: 'device',
      transmittedAt: clock.now(),
      measurements: Array.from({ length: 10 }, (_, i) => ({
        observationId: `hist-${i}`,
        deviceId: 'GW-YAS-01',
        meterId: 'FM-YAS-INLET-01',
        dmaId: 'DMA-YASAMAL-04',
        metric: 'FLOW_M3H',
        unit: 'm3/h',
        value: 80.0,
        observedAt: new Date(histStart.getTime() - (10 - i) * 10 * 60 * 1000),
      })),
    });
    expect(histBatch.acceptedCount).toBe(10);
    expect(histBatch.historicalCount).toBe(10);
    expect(histBatch.triggeredLiveDispatch).toBe(false);

    const histAssess = await assessUc.assessAndOpenIncidentIfNeeded({
      dmaId: 'DMA-YASAMAL-04',
      localDateYmd: '2026-10-19',
      actor: { actorId: 'disp-1', role: 'dispatcher' },
      correlationId: 'cor-hist',
    });
    expect(histAssess?.incidentCreated).toBe(false);
    expect(outbox).toHaveLength(0);

    // 2. Ingest LIVE anomalous nocturnal readings across [02:00, 03:50] AZT for DMA-YASAMAL-04
    // Advance clock along the night window so readings are LIVE
    const nightStartUtc = new Date('2026-10-19T22:00:00Z');
    for (let i = 0; i < 12; i++) {
      const t = new Date(nightStartUtc.getTime() + i * 10 * 60 * 1000);
      clock.setTime(t);
      const res = await ingestUc.execute({
        authenticatedDeviceId: 'GW-YAS-01',
        actorRole: 'device',
        transmittedAt: t,
        measurements: [
          {
            observationId: `live-in-${i}`,
            deviceId: 'GW-YAS-01',
            meterId: 'FM-YAS-INLET-01',
            dmaId: 'DMA-YASAMAL-04',
            metric: 'FLOW_M3H',
            unit: 'm3/h',
            value: 68.4,
            observedAt: t,
          },
        ],
      });
      expect(res.liveCount).toBe(1);
    }

    // 3. Assess DMA-YASAMAL-04 -> creates DETECTED incident; DMA-NASIMI-02 stays empty!
    const liveAssess = await assessUc.assessAndOpenIncidentIfNeeded({
      dmaId: 'DMA-YASAMAL-04',
      localDateYmd: '2026-10-20',
      actor: { actorId: 'disp-1', role: 'dispatcher' },
      correlationId: 'cor-live',
    });
    expect(liveAssess?.incidentCreated).toBe(true);
    const incId = liveAssess!.incident!.incidentId;
    expect(await incidentRepo.getByDma('DMA-NASIMI-02')).toHaveLength(0);

    // 4. Transition DETECTED -> ASSIGNED -> IN_REPAIR -> REPAIRED -> VERIFIED -> CLOSED via shared use case
    const dispatcher = { actorId: 'disp-1', role: 'dispatcher' as const };
    const r1 = await transitionUc.execute({
      incidentId: incId,
      commandId: 'cmd-1',
      expectedVersion: 1,
      actor: dispatcher,
      event: {
        type: 'ASSIGN',
        crew: { crewId: 'C1', crewName: 'Crew 1', crewPhone: '+994-50-000', role: 'Lead', etaMinutes: 20 },
      },
    });
    expect(r1.ok).toBe(true);

    const r2 = await transitionUc.execute({
      incidentId: incId,
      commandId: 'cmd-2',
      expectedVersion: 2,
      actor: dispatcher,
      event: { type: 'START_REPAIR', technicianId: 'TECH-1' },
    });
    expect(r2.ok).toBe(true);

    const r3 = await transitionUc.execute({
      incidentId: incId,
      commandId: 'cmd-3',
      expectedVersion: 3,
      actor: dispatcher,
      event: {
        type: 'RECORD_REPAIR_EVIDENCE',
        evidence: {
          technicianId: 'TECH-1',
          repairMethod: 'Clamp Ø200mm',
          photoFixtureRef: 'fixture://photos/yas-01.webp',
          technicianNotes: 'Sealed',
        },
      },
    });
    expect(r3.ok).toBe(true);

    const r4 = await transitionUc.execute({
      incidentId: incId,
      commandId: 'cmd-4',
      expectedVersion: 4,
      actor: dispatcher,
      event: {
        type: 'EVALUATE_VERIFICATION',
        evidence: {
          baselineMnfM3h: 25.0,
          preRepairWindow: {
            windowStart: new Date('2026-10-19T22:00:00Z'),
            windowEnd: new Date('2026-10-20T00:00:00Z'),
            sampleCount: 12,
            coverageRatio: 0.92,
            mnfM3h: 68.4,
            avgPressureBar: 4.0,
            provenance: 'PERSISTED_LIVE_WINDOW',
          },
          postRepairWindow: {
            windowStart: new Date('2026-10-20T22:00:00Z'),
            windowEnd: new Date('2026-10-21T00:00:00Z'),
            sampleCount: 12,
            coverageRatio: 0.92,
            mnfM3h: 26.2,
            avgPressureBar: 4.0,
            provenance: 'PERSISTED_POST_WINDOW',
          },
        },
      },
    });
    expect(r4.ok).toBe(true);
    if (r4.ok) expect(r4.incident.state).toBe('VERIFIED');

    const r5 = await transitionUc.execute({
      incidentId: incId,
      commandId: 'cmd-5',
      expectedVersion: 5,
      actor: dispatcher,
      event: { type: 'CLOSE' },
    });
    expect(r5.ok).toBe(true);
    if (r5.ok) {
      expect(r5.incident.state).toBe('CLOSED');
      expect(r5.incident.closedBy).toBe('disp-1');
    }
  });
});
