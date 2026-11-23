/**
 * OpenAPI 3.1.0 HTTP Contract Test Suite (SAMT v1.1.0)
 * Dereferences `contracts/openapi.yaml` and asserts that live Express `/v1/*` HTTP responses
 * conform to the documented paths, status codes, and required response schema properties.
 */

import http from 'node:http';
import path from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

interface SchemaObject {
  required?: string[];
  properties?: Record<string, SchemaObject>;
  enum?: unknown[];
}

function assertMatchesOpenApiRequired(body: Record<string, unknown>, schema: SchemaObject, label: string) {
  for (const key of schema.required ?? []) {
    expect(body, `${label} missing required OpenAPI property '${key}'`).toHaveProperty(key);
  }
}

describe('OpenAPI 3.1.0 Live HTTP Contract Verification', () => {
  const config = loadConfig();
  let pool: DbPool;
  let server: http.Server;
  let baseUrl: string;
  let openApi: Record<string, unknown>;
  const clock = new FixedClock('2026-10-20T03:00:00+04:00');

  beforeAll(async () => {
    const specPath = path.resolve(import.meta.dirname, '..', '..', 'contracts', 'openapi.yaml');
    openApi = (await SwaggerParser.dereference(specPath)) as Record<string, unknown>;

    pool = createDbPool(config.databaseUrl, 6);
    await runMigrations(pool);
    await seedDatabase(pool);
    await resetOperationalTables(pool);

    const meterRegistry = new PostgresMeterRegistry(pool);
    await meterRegistry.refresh();
    const app = createApp({
      config,
      pool,
      meterRegistry,
      telemetryRepo: new PostgresTelemetryRepository(pool),
      incidentRepo: new PostgresIncidentRepository(pool),
      auditRepo: new PostgresAuditAndAllocationRepository(pool),
      clock,
    });

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = (server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}/v1`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });

  function getResponseSchema(route: string, method: string, status: string): SchemaObject {
    const paths = openApi.paths as Record<string, Record<string, Record<string, unknown>>>;
    const op = paths[route]?.[method.toLowerCase()];
    expect(op, `OpenAPI missing ${method} ${route}`).toBeDefined();
    const responses = op.responses as Record<string, { content?: { 'application/json'?: { schema: SchemaObject } } }>;
    const schema = responses[status]?.content?.['application/json']?.schema;
    expect(schema, `OpenAPI missing schema for ${method} ${route} ${status}`).toBeDefined();
    return schema!;
  }

  it('verifies GET /v1/dmas, POST /v1/telemetry/batch, GET /v1/dma/{dma_id}/balance, GET /v1/dma/{dma_id}/night-flow, POST /v1/allocation/solve, POST /v1/savings/estimate, GET /v1/incidents, and error responses against OpenAPI 3.1 schemas', async () => {
    const authDispatcher = { Authorization: `Bearer ${config.dispatcherToken}` };
    const authDevice = { 'X-Device-Token': 'samt-dev-device-yas-01' };

    // 1. 401 ErrorResponse schema check
    const unauth = await fetch(`${baseUrl}/dmas`);
    expect(unauth.status).toBe(401);
    assertMatchesOpenApiRequired(
      await unauth.json(),
      getResponseSchema('/dmas', 'get', '401'),
      'GET /dmas 401'
    );

    // 2. GET /v1/dmas 200
    const dmasRes = await fetch(`${baseUrl}/dmas`, { headers: authDispatcher });
    expect(dmasRes.status).toBe(200);
    assertMatchesOpenApiRequired(
      await dmasRes.json(),
      getResponseSchema('/dmas', 'get', '200'),
      'GET /dmas 200'
    );

    // 3. POST /v1/telemetry/batch 200
    const nowIso = clock.now().toISOString();
    const batchRes = await fetch(`${baseUrl}/telemetry/batch`, {
      method: 'POST',
      headers: { ...authDevice, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gateway_id: 'GW-YAS-01',
        batch_timestamp: nowIso,
        measurements: [
          {
            observation_id: 'contract-obs-1',
            meter_id: 'FM-YAS-INLET-01',
            dma_id: 'DMA-YASAMAL-04',
            metric: 'FLOW_M3H',
            unit: 'm3/h',
            value: 65.0,
            observed_at: nowIso,
          },
        ],
      }),
    });
    expect(batchRes.status).toBe(200);
    assertMatchesOpenApiRequired(
      await batchRes.json(),
      getResponseSchema('/telemetry/batch', 'post', '200'),
      'POST /telemetry/batch 200'
    );

    // 4. GET /v1/dma/{dma_id}/balance 200
    const balRes = await fetch(`${baseUrl}/dma/DMA-YASAMAL-04/balance`, { headers: authDispatcher });
    expect(balRes.status).toBe(200);
    assertMatchesOpenApiRequired(
      await balRes.json(),
      getResponseSchema('/dma/{dma_id}/balance', 'get', '200'),
      'GET /dma/{dma_id}/balance 200'
    );

    // 5. GET /v1/dma/{dma_id}/night-flow 200
    const mnfRes = await fetch(`${baseUrl}/dma/DMA-YASAMAL-04/night-flow?date=2026-10-20`, {
      headers: authDispatcher,
    });
    expect(mnfRes.status).toBe(200);
    assertMatchesOpenApiRequired(
      await mnfRes.json(),
      getResponseSchema('/dma/{dma_id}/night-flow', 'get', '200'),
      'GET /dma/{dma_id}/night-flow 200'
    );

    // 6. GET /v1/incidents 200 & GET /v1/audit 200
    const incRes = await fetch(`${baseUrl}/incidents`, { headers: authDispatcher });
    expect(incRes.status).toBe(200);
    assertMatchesOpenApiRequired(
      await incRes.json(),
      getResponseSchema('/incidents', 'get', '200'),
      'GET /incidents 200'
    );

    const audRes = await fetch(`${baseUrl}/audit`, { headers: authDispatcher });
    expect(audRes.status).toBe(200);
    assertMatchesOpenApiRequired(
      await audRes.json(),
      getResponseSchema('/audit', 'get', '200'),
      'GET /audit 200'
    );

    // 7. POST /v1/allocation/solve 200
    const allocRes = await fetch(`${baseUrl}/allocation/solve`, {
      method: 'POST',
      headers: { ...authDispatcher, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region_id: 'REG-KUR-ARAS-03',
        canal_network_id: 'CANAL-NET-SHIRVAN-01',
        available_water_m3: 900,
        consumers: [
          { id: 'c1', name: 'C1', demand_m3: 100, priority_weight: 0.9, canal_capacity_m3: 150 },
        ],
      }),
    });
    expect(allocRes.status).toBe(200);
    assertMatchesOpenApiRequired(
      await allocRes.json(),
      getResponseSchema('/allocation/solve', 'post', '200'),
      'POST /allocation/solve 200'
    );

    // 8. POST /v1/savings/estimate 200
    const savRes = await fetch(`${baseUrl}/savings/estimate`, {
      method: 'POST',
      headers: { ...authDispatcher, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseline_flow_m3h: 100,
        baseline_pressure_bar: 4.0,
        post_repair_flow_m3h: 50,
        post_repair_pressure_bar: 1.0,
        leakage_exponent: 0.5,
      }),
    });
    expect(savRes.status).toBe(200);
    assertMatchesOpenApiRequired(
      await savRes.json(),
      getResponseSchema('/savings/estimate', 'post', '200'),
      'POST /savings/estimate 200'
    );
  });
});
