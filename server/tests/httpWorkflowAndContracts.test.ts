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
import { createApp } from '../src/http/app.js';
import { FixedClock } from '../../prototype/src/domain/ports/Clock.js';
import { integrateMultipleMeters } from '../../prototype/src/domain/balance/flowIntegration.js';
import { calculateWaterBalance } from '../../prototype/src/domain/balance/waterBalance.js';

interface RunningServer {
  baseUrl: string;
  close: () => Promise<void>;
  pool: DbPool;
  clock: FixedClock;
}

async function startTestServer(clock: FixedClock): Promise<RunningServer> {
  const config = loadConfig();
  const pool = createDbPool(config.databaseUrl, 10);
  await runMigrations(pool);
  await seedDatabase(pool);
  const meterRegistry = new PostgresMeterRegistry(pool);
  await meterRegistry.refresh();
  const telemetryRepo = new PostgresTelemetryRepository(pool);
  const incidentRepo = new PostgresIncidentRepository(pool);
  const auditRepo = new PostgresAuditAndAllocationRepository(pool);

  const app = createApp({
    config,
    pool,
    meterRegistry,
    telemetryRepo,
    incidentRepo,
    auditRepo,
    clock,
  });

  const server: http.Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    pool,
    clock,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      await pool.end();
    },
  };
}

describe('SAMT v1.1.0 Persistent HTTP Workflow, RBAC, Parity & Restart Recovery', () => {
  const config = loadConfig();
  let srv: RunningServer;
  let clock: FixedClock;

  const authDispatcher = { Authorization: `Bearer ${config.dispatcherToken}` };
  const authViewer = { Authorization: `Bearer ${config.viewerToken}` };
  const authDevYas1 = { 'X-Device-Token': 'samt-dev-device-yas-01' };
  const authDevYas2 = { 'X-Device-Token': 'samt-dev-device-yas-02' };

  beforeAll(async () => {
    clock = new FixedClock('2026-10-19T23:55:00Z'); // 03:55 AZT on 2026-10-20
    srv = await startTestServer(clock);
  });

  beforeEach(async () => {
    await resetOperationalTables(srv.pool);
    clock.setTime('2026-10-19T23:55:00Z');
  });

  afterAll(async () => {
    await srv.close();
  });

  it('enforces server-side RBAC (401 unauthenticated, 403 viewer/device role enforcement)', async () => {
    // Health & Ready
    const health = await fetch(`${srv.baseUrl}/health`);
    expect(health.status).toBe(200);
    const ready = await fetch(`${srv.baseUrl}/ready`);
    expect(ready.status).toBe(200);
    expect((await ready.json()).database).toBe('UP');

    // Unauthenticated rejected with 401
    expect((await fetch(`${srv.baseUrl}/v1/incidents`)).status).toBe(401);
    expect((await fetch(`${srv.baseUrl}/v1/telemetry/batch`, { method: 'POST' })).status).toBe(401);

    // Viewer can read /v1/incidents, CANNOT assess or transition (403)
    expect((await fetch(`${srv.baseUrl}/v1/incidents`, { headers: authViewer })).status).toBe(200);
    const viewerAssess = await fetch(`${srv.baseUrl}/v1/dma/DMA-YASAMAL-04/assess`, {
      method: 'POST',
      headers: { ...authViewer, 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-10-20' }),
    });
    expect(viewerAssess.status).toBe(403);

    // Device token CANNOT read incidents (403); dispatcher CANNOT ingest device telemetry (403)
    expect((await fetch(`${srv.baseUrl}/v1/incidents`, { headers: authDevYas1 })).status).toBe(403);
    const dispIngest = await fetch(`${srv.baseUrl}/v1/telemetry/batch`, {
      method: 'POST',
      headers: { ...authDispatcher, 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_timestamp: clock.now().toISOString(), measurements: [] }),
    });
    expect(dispIngest.status).toBe(403);
  });

  it('validates partial batches, deduplicates durably across restart, and persists bounded historical replay without live dispatch', async () => {
    const nowIso = clock.now().toISOString();

    // 1. Partial batch: 1 valid live + 1 invalid negative + 1 inactive meter + 1 wrong device binding + 1 future skew
    const partialRes = await fetch(`${srv.baseUrl}/v1/telemetry/batch`, {
      method: 'POST',
      headers: { ...authDevYas1, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gateway_id: 'GW-YAS-01',
        batch_timestamp: nowIso,
        measurements: [
          {
            observation_id: 'obs-good-1',
            meter_id: 'FM-YAS-INLET-01',
            dma_id: 'DMA-YASAMAL-04',
            metric: 'FLOW_M3H',
            unit: 'm3/h',
            value: 55.0,
            observed_at: nowIso,
            battery_volts: 3.5,
          },
          {
            observation_id: 'obs-neg-1',
            meter_id: 'FM-YAS-INLET-01',
            dma_id: 'DMA-YASAMAL-04',
            metric: 'FLOW_M3H',
            value: -10,
            observed_at: nowIso,
          },
          {
            observation_id: 'obs-inact-1',
            meter_id: 'FM-YAS-INACTIVE-99',
            dma_id: 'DMA-YASAMAL-04',
            metric: 'FLOW_M3H',
            value: 12,
            observed_at: nowIso,
          },
          {
            observation_id: 'obs-wrong-dev',
            meter_id: 'FM-YAS-INLET-02', // Bound to GW-YAS-02!
            dma_id: 'DMA-YASAMAL-04',
            metric: 'FLOW_M3H',
            value: 50,
            observed_at: nowIso,
          },
          {
            observation_id: 'obs-future-1',
            meter_id: 'FM-YAS-INLET-01',
            dma_id: 'DMA-YASAMAL-04',
            metric: 'FLOW_M3H',
            value: 50,
            observed_at: new Date(clock.now().getTime() + 40 * 60 * 1000).toISOString(),
          },
        ],
      }),
    });
    expect(partialRes.status).toBe(200);
    const partialBody = await partialRes.json();
    expect(partialBody.status).toBe('PARTIALLY_ACCEPTED');
    expect(partialBody.accepted_count).toBe(1);
    expect(partialBody.quarantined_count).toBe(1);
    expect(partialBody.rejected_count).toBe(3);

    // 2. Restart server & submit exact same obs-good-1 -> durable PostgreSQL dedup marks it DUPLICATE!
    const restarted = await startTestServer(clock);
    try {
      const dupRes = await fetch(`${restarted.baseUrl}/v1/telemetry/batch`, {
        method: 'POST',
        headers: { ...authDevYas1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway_id: 'GW-YAS-01',
          batch_timestamp: nowIso,
          measurements: [
            {
              observation_id: 'obs-good-1',
              meter_id: 'FM-YAS-INLET-01',
              dma_id: 'DMA-YASAMAL-04',
              metric: 'FLOW_M3H',
              value: 55.0,
              observed_at: nowIso,
            },
          ],
        }),
      });
      expect(dupRes.status).toBe(200);
      const dupBody = await dupRes.json();
      expect(dupBody.status).toBe('DUPLICATE_ONLY');
      expect(dupBody.duplicate_count).toBe(1);
      expect(dupBody.accepted_count).toBe(0);

      // 3. Submit 12 bounded historical anomalous readings from 24h ago -> persisted, NO live dispatch!
      const prevNightStart = Date.parse('2026-10-18T22:00:00Z'); // 2026-10-19 02:00 AZT
      const histRes = await fetch(`${restarted.baseUrl}/v1/telemetry/batch`, {
        method: 'POST',
        headers: { ...authDevYas1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway_id: 'GW-YAS-01',
          batch_timestamp: nowIso,
          is_historical_replay: true,
          measurements: Array.from({ length: 12 }, (_, i) => ({
            observation_id: `hist-prev-${i}`,
            meter_id: 'FM-YAS-INLET-01',
            dma_id: 'DMA-YASAMAL-04',
            metric: 'FLOW_M3H',
            value: 85.0,
            observed_at: new Date(prevNightStart + i * 10 * 60 * 1000).toISOString(),
          })),
        }),
      });
      expect(histRes.status).toBe(200);
      const histBody = await histRes.json();
      expect(histBody.historical_count).toBe(12);
      expect(histBody.live_count).toBe(0);
      expect(histBody.triggered_live_dispatch).toBe(false);

      // Assess that historical date -> must NOT open a live incident or outbox notification!
      const histAssess = await fetch(`${restarted.baseUrl}/v1/dma/DMA-YASAMAL-04/assess`, {
        method: 'POST',
        headers: { ...authDispatcher, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: '2026-10-19' }),
      });
      expect(histAssess.status).toBe(200);
      expect((await histAssess.json()).incident_created).toBe(false);

      const outbox = await fetch(`${restarted.baseUrl}/v1/outbox`, { headers: authDispatcher });
      expect((await outbox.json()).outbox).toHaveLength(0);
    } finally {
      await restarted.close();
    }
  });

  it('proves persisted API multi-meter balance matches shared domain integrator (2 inlets @ 100 m³/h = 50 m³)', async () => {
    const windowStart = new Date('2026-10-19T23:00:00Z');
    const windowEnd = new Date('2026-10-19T23:15:00Z');
    clock.setTime(windowEnd);

    const make61 = (prefix: string, meterId: string, val: number) =>
      Array.from({ length: 61 }, (_, i) => ({
        observation_id: `${prefix}-${i}`,
        meter_id: meterId,
        dma_id: 'DMA-YASAMAL-04',
        metric: 'FLOW_M3H' as const,
        unit: 'm3/h' as const,
        value: val,
        observed_at: new Date(windowStart.getTime() + i * 15 * 1000).toISOString(),
      }));

    // Ingest inlet 1 + outlet 1 via GW-YAS-01, and inlet 2 via GW-YAS-02
    const r1 = await fetch(`${srv.baseUrl}/v1/telemetry/batch`, {
      method: 'POST',
      headers: { ...authDevYas1, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gateway_id: 'GW-YAS-01',
        batch_timestamp: windowEnd.toISOString(),
        measurements: [
          ...make61('m1', 'FM-YAS-INLET-01', 100.0),
          ...make61('o1', 'FM-YAS-OUTLET-01', 20.0),
        ],
      }),
    });
    expect(r1.status).toBe(200);

    const r2 = await fetch(`${srv.baseUrl}/v1/telemetry/batch`, {
      method: 'POST',
      headers: { ...authDevYas2, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gateway_id: 'GW-YAS-02',
        batch_timestamp: windowEnd.toISOString(),
        measurements: make61('m2', 'FM-YAS-INLET-02', 100.0),
      }),
    });
    expect(r2.status).toBe(200);

    const balRes = await fetch(
      `${srv.baseUrl}/v1/dma/DMA-YASAMAL-04/balance?window_start=${encodeURIComponent(windowStart.toISOString())}&window_end=${encodeURIComponent(windowEnd.toISOString())}&authorized_billed_m3=5`,
      { headers: authViewer }
    );
    expect(balRes.status).toBe(200);
    const apiBal = await balRes.json();

    // Direct pure domain calculation on identical fixture
    const domainInlets = integrateMultipleMeters(
      new Map([
        [
          'FM-YAS-INLET-01',
          Array.from({ length: 61 }, (_, i) => ({
            timestamp: new Date(windowStart.getTime() + i * 15 * 1000),
            flowM3h: 100.0,
          })),
        ],
        [
          'FM-YAS-INLET-02',
          Array.from({ length: 61 }, (_, i) => ({
            timestamp: new Date(windowStart.getTime() + i * 15 * 1000),
            flowM3h: 100.0,
          })),
        ],
      ]),
      { windowStart, windowEnd, expectedSampleIntervalSec: 15 }
    );
    const domainBal = calculateWaterBalance({
      dmaId: 'DMA-YASAMAL-04',
      dmaName: 'Yasamal',
      windowStart,
      windowEnd,
      inletContributions: domainInlets.perMeter.map((p) => ({
        meterId: p.meterId,
        meterName: p.meterId,
        role: 'INLET',
        volumeM3: p.result.totalVolumeM3,
        averageFlowM3h: p.result.averageFlowM3h,
        coverageRatio: p.result.coverageRatio,
      })),
      outletContributions: [
        {
          meterId: 'FM-YAS-OUTLET-01',
          meterName: 'Outlet',
          role: 'OUTLET',
          volumeM3: 5.0,
          averageFlowM3h: 20.0,
          coverageRatio: 1.0,
        },
      ],
      authorizedBilledConsumptionM3: 5.0,
    });

    expect(apiBal.total_inflow_m3).toBeCloseTo(50.0, 3);
    expect(apiBal.total_inflow_m3).toBeCloseTo(domainBal.totalInflowM3, 3);
    expect(apiBal.total_outflow_m3).toBeCloseTo(5.0, 3);
    expect(apiBal.signed_residual_m3).toBeCloseTo(40.0, 3);
    expect(apiBal.signed_residual_m3).toBeCloseTo(domainBal.signedResidualM3, 3);
  });

  it('executes full authenticated HTTP workflow through PostgreSQL closure, DMA isolation, forged-verdict rejection, and restart reload', async () => {
    // 1. Ingest 12 LIVE anomalous nocturnal samples for 2026-10-20 [02:00..03:50 AZT]
    const night1Start = Date.parse('2026-10-19T22:00:00Z');
    for (let i = 0; i < 12; i++) {
      const t = new Date(night1Start + i * 10 * 60 * 1000);
      clock.setTime(t);
      const res = await fetch(`${srv.baseUrl}/v1/telemetry/batch`, {
        method: 'POST',
        headers: { ...authDevYas1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway_id: 'GW-YAS-01',
          batch_timestamp: t.toISOString(),
          measurements: [
            {
              observation_id: `e2e-n1-flow-${i}`,
              meter_id: 'FM-YAS-INLET-01',
              dma_id: 'DMA-YASAMAL-04',
              metric: 'FLOW_M3H',
              value: 68.5,
              observed_at: t.toISOString(),
            },
            {
              observation_id: `e2e-n1-press-${i}`,
              meter_id: 'PT-YAS-PRESSURE-01',
              dma_id: 'DMA-YASAMAL-04',
              metric: 'PRESSURE_BAR',
              value: 4.0,
              observed_at: t.toISOString(),
            },
          ],
        }),
      });
      expect(res.status).toBe(200);
    }

    // 2. Assess DMA-YASAMAL-04 -> opens DETECTED incident; DMA-NASIMI-02 stays completely isolated (empty)
    const assessRes = await fetch(`${srv.baseUrl}/v1/dma/DMA-YASAMAL-04/assess`, {
      method: 'POST',
      headers: { ...authDispatcher, 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-10-20', pipe_segment_id: 'PIPE-YAS-4412' }),
    });
    expect(assessRes.status).toBe(201);
    const assessBody = await assessRes.json();
    expect(assessBody.incident_created).toBe(true);
    const incId: string = assessBody.incident.incident_id;

    const nasimiList = await fetch(`${srv.baseUrl}/v1/incidents?dma_id=DMA-NASIMI-02`, {
      headers: authViewer,
    });
    expect((await nasimiList.json()).incidents).toHaveLength(0);

    // 3. ASSIGN (v1 -> v2), START_REPAIR (v2 -> v3), RECORD_REPAIR_EVIDENCE (v3 -> v4)
    const sendTransition = (body: Record<string, unknown>) =>
      fetch(`${srv.baseUrl}/v1/incidents/${incId}/transition`, {
        method: 'POST',
        headers: { ...authDispatcher, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    expect(
      (
        await sendTransition({
          event_type: 'ASSIGN',
          expected_version: 1,
          command_id: 'e2e-cmd-assign',
          payload: {
            crew_id: 'CREW-01',
            crew_name: 'Baku Crew #1',
            crew_phone: '+994 50 111-22-33',
            role: 'Lead Engineer',
            eta_minutes: 20,
          },
        })
      ).status
    ).toBe(200);

    expect(
      (
        await sendTransition({
          event_type: 'START_REPAIR',
          expected_version: 2,
          command_id: 'e2e-cmd-start',
          payload: { technician_id: 'TECH-01' },
        })
      ).status
    ).toBe(200);

    expect(
      (
        await sendTransition({
          event_type: 'RECORD_REPAIR_EVIDENCE',
          expected_version: 3,
          command_id: 'e2e-cmd-repair-1',
          payload: {
            technician_id: 'TECH-01',
            repair_method: 'Clamp Ø200mm',
            photo_fixture_ref: 'fixture://photos/yas-01.webp',
            technician_notes: 'First repair pass',
          },
        })
      ).status
    ).toBe(200);

    // 4. Forged is_successful=true with bad post-repair reading (64 m³/h) -> reverts to IN_REPAIR (v5)!
    const forgedRes = await sendTransition({
      event_type: 'EVALUATE_VERIFICATION',
      expected_version: 4,
      command_id: 'e2e-cmd-forged',
      payload: {
        is_successful: true,
        claimed_success: true,
        pre_repair_window: {
          window_start: '2026-10-19T22:00:00Z',
          window_end: '2026-10-20T00:00:00Z',
          sample_count: 12,
          coverage_ratio: 0.92,
          mnf_m3h: 68.5,
          avg_pressure_bar: 4.0,
          provenance: 'POSTGRES_TELEMETRY',
        },
        post_repair_window: {
          window_start: '2026-10-20T22:00:00Z',
          window_end: '2026-10-21T00:00:00Z',
          sample_count: 12,
          coverage_ratio: 0.92,
          mnf_m3h: 64.0,
          avg_pressure_bar: 4.0,
          provenance: 'POSTGRES_TELEMETRY',
        },
      },
    });
    expect(forgedRes.status).toBe(200);
    const forgedBody = await forgedRes.json();
    expect(forgedBody.incident.state).toBe('IN_REPAIR');
    expect(forgedBody.incident.version).toBe(5);
    expect(forgedBody.incident.verification_result.is_successful).toBe(false);

    // 5. Re-record repair evidence (v5 -> v6)
    expect(
      (
        await sendTransition({
          event_type: 'RECORD_REPAIR_EVIDENCE',
          expected_version: 5,
          command_id: 'e2e-cmd-repair-2',
          payload: {
            technician_id: 'TECH-01',
            repair_method: 'Full welded coupling replacement Ø200mm',
            photo_fixture_ref: 'fixture://photos/yas-02.webp',
            technician_notes: 'Rework sealed permanently',
          },
        })
      ).status
    ).toBe(200);

    // 6. Ingest 12 LIVE healthy post-repair nocturnal samples on 2026-10-21 [02:00..03:50 AZT]
    const night2Start = Date.parse('2026-10-20T22:00:00Z');
    for (let i = 0; i < 12; i++) {
      const t = new Date(night2Start + i * 10 * 60 * 1000);
      clock.setTime(t);
      const res = await fetch(`${srv.baseUrl}/v1/telemetry/batch`, {
        method: 'POST',
        headers: { ...authDevYas1, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway_id: 'GW-YAS-01',
          batch_timestamp: t.toISOString(),
          measurements: [
            {
              observation_id: `e2e-n2-flow-${i}`,
              meter_id: 'FM-YAS-INLET-01',
              dma_id: 'DMA-YASAMAL-04',
              metric: 'FLOW_M3H',
              value: 26.0,
              observed_at: t.toISOString(),
            },
            {
              observation_id: `e2e-n2-press-${i}`,
              meter_id: 'PT-YAS-PRESSURE-01',
              dma_id: 'DMA-YASAMAL-04',
              metric: 'PRESSURE_BAR',
              value: 4.0,
              observed_at: t.toISOString(),
            },
          ],
        }),
      });
      expect(res.status).toBe(200);
    }

    // 7. Server-authoritative verification directly from persisted PostgreSQL dates! (v6 -> v7)
    const verifyRes = await sendTransition({
      event_type: 'EVALUATE_VERIFICATION',
      expected_version: 6,
      command_id: 'e2e-cmd-verify-ok',
      payload: {
        pre_repair_date: '2026-10-20',
        post_repair_date: '2026-10-21',
      },
    });
    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.incident.state).toBe('VERIFIED');
    expect(verifyBody.incident.version).toBe(7);
    expect(verifyBody.incident.verification_result.outcome).toBe('VERIFIED_SYNTHETIC_POLICY');
    expect(verifyBody.incident.verification_result.verified_loss_drop_m3h).toBeCloseTo(42.5, 1);

    // 8. Close incident (v7 -> v8)
    const closeRes = await sendTransition({
      event_type: 'CLOSE',
      expected_version: 7,
      command_id: 'e2e-cmd-close',
      payload: { notes: 'Verified and archived' },
    });
    expect(closeRes.status).toBe(200);
    expect((await closeRes.json()).incident.state).toBe('CLOSED');

    // 9. Restart HTTP server & reload incident + durable audit trail from PostgreSQL
    const reloadedServer = await startTestServer(clock);
    try {
      const detailRes = await fetch(`${reloadedServer.baseUrl}/v1/incidents/${incId}`, {
        headers: authViewer,
      });
      expect(detailRes.status).toBe(200);
      const detail = await detailRes.json();
      expect(detail.incident.state).toBe('CLOSED');
      expect(detail.incident.version).toBe(8);
      expect(detail.incident.closed_by).toBe('dispatcher-baku-01');
      expect(detail.incident.verification_result.outcome).toBe('VERIFIED_SYNTHETIC_POLICY');
      expect(detail.audit_events.length).toBeGreaterThanOrEqual(8);
    } finally {
      await reloadedServer.close();
    }
  });

  it('serves /v1/allocation/solve and /v1/savings/estimate matching regression fixtures', async () => {
    const allocRes = await fetch(`${srv.baseUrl}/v1/allocation/solve`, {
      method: 'POST',
      headers: { ...authDispatcher, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region_id: 'REG-KUR-ARAS-03',
        canal_network_id: 'CANAL-NET-SHIRVAN-01',
        available_water_m3: 900,
        volume_unit: 'THOUSAND_M3',
        delivery_horizon_hours: 24,
        consumers: [
          { id: 'c1', name: 'C1', demand_m3: 140, priority_weight: 0.9, canal_capacity_m3: 150 },
          { id: 'c2', name: 'C2', demand_m3: 210, priority_weight: 0.85, canal_capacity_m3: 220 },
          { id: 'c3', name: 'C3', demand_m3: 85, priority_weight: 0.75, canal_capacity_m3: 100 },
          { id: 'c4', name: 'C4', demand_m3: 160, priority_weight: 0.95, canal_capacity_m3: 180 },
          { id: 'c5', name: 'C5', demand_m3: 110, priority_weight: 0.7, canal_capacity_m3: 120 },
        ],
      }),
    });
    expect(allocRes.status).toBe(200);
    const alloc = await allocRes.json();
    expect(alloc.total_allocated_m3).toBe(705);
    expect(alloc.unmet_demand_m3).toBe(0);
    expect(alloc.residual_supply_m3).toBe(195);
    expect(alloc.run_id).toBeTruthy();

    const savRes = await fetch(`${srv.baseUrl}/v1/savings/estimate`, {
      method: 'POST',
      headers: { ...authViewer, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseline_flow_m3h: 100,
        baseline_pressure_bar: 4.0,
        post_repair_flow_m3h: 50,
        post_repair_pressure_bar: 1.0,
        leakage_exponent: 0.5,
      }),
    });
    expect(savRes.status).toBe(200);
    const sav = await savRes.json();
    expect(sav.pressure_adjusted_hourly_savings_m3h).toBeCloseTo(0, 2);
  });
});
