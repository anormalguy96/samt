/**
 * SAMT v1.1.0 Reproducible Local Workload Benchmark & EXPLAIN (ANALYZE, BUFFERS) Capture
 * Grounded in resources/lectures_merged.pdf pp. 104-109 (reproducible workloads,
 * latency percentiles, measurement-driven optimization).
 *
 * Compares BEFORE (ROW_BY_ROW inserts per observation) vs AFTER (single-query UNNEST batch upsert)
 * against live Express HTTP API + PostgreSQL 16 with fixed seed and post-run correctness checks.
 */

import http from 'node:http';
import os from 'node:os';
import { loadConfig } from '../server/src/config.js';
import { createDbPool } from '../server/src/db/pool.js';
import { runMigrations } from '../server/src/db/migrate.js';
import { resetOperationalTables, seedDatabase } from '../server/src/db/seed.js';
import { PostgresIncidentRepository } from '../server/src/repositories/PostgresIncidentRepository.js';
import {
  PostgresMeterRegistry,
  PostgresTelemetryRepository,
  type TelemetryWriteMode,
} from '../server/src/repositories/PostgresTelemetryRepository.js';
import { PostgresAuditAndAllocationRepository } from '../server/src/repositories/PostgresAuditAndAllocationRepository.js';
import { createApp } from '../server/src/http/app.js';
import { FixedClock } from '../prototype/src/domain/ports/Clock.js';

const SEED = 20261123;
const BATCH_SIZE = 60;
const WARMUP_BATCHES = 5;
const MEASURED_BATCHES = 60; // 60 * 60 = 3,600 observations per run
const CONCURRENCY = 4;

// Deterministic PRNG (Mulberry32)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx].toFixed(2));
}

async function runModeBenchmark(writeMode: TelemetryWriteMode) {
  const config = loadConfig();
  const pool = createDbPool(config.databaseUrl, 12);
  await runMigrations(pool);
  await seedDatabase(pool);
  await resetOperationalTables(pool);

  const pgVersionRes = await pool.query<{ v: string }>('SELECT version() AS v');
  const pgVersion = pgVersionRes.rows[0]?.v ?? 'unknown';

  const clock = new FixedClock('2026-10-20T03:00:00+04:00');
  const meterRegistry = new PostgresMeterRegistry(pool);
  await meterRegistry.refresh();
  const telemetryRepo = new PostgresTelemetryRepository(pool, writeMode);
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
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const rng = mulberry32(SEED);
  const baseMs = clock.now().getTime();

  const sendBatch = async (batchIndex: number, prefix: string) => {
    const measurements = Array.from({ length: BATCH_SIZE }, (_, j) => ({
      observation_id: `${prefix}-${batchIndex}-${j}`,
      meter_id: j % 2 === 0 ? 'FM-YAS-INLET-01' : 'FM-YAS-OUTLET-01',
      dma_id: 'DMA-YASAMAL-04',
      metric: 'FLOW_M3H' as const,
      unit: 'm3/h' as const,
      value: Number((80 + rng() * 20).toFixed(2)),
      observed_at: new Date(baseMs - (BATCH_SIZE - j) * 1000).toISOString(),
      battery_volts: 3.6,
    }));

    const t0 = performance.now();
    const res = await fetch(`${baseUrl}/v1/telemetry/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Token': 'samt-dev-device-yas-01',
      },
      body: JSON.stringify({
        gateway_id: 'GW-YAS-01',
        batch_timestamp: clock.now().toISOString(),
        measurements,
      }),
    });
    const elapsedMs = performance.now() - t0;
    const body = await res.json();
    return { status: res.status, elapsedMs, accepted: Number(body.accepted_count ?? 0) };
  };

  try {
    // Warmup batches (unmeasured)
    for (let w = 0; w < WARMUP_BATCHES; w++) {
      await sendBatch(w, `warm-${writeMode}`);
    }

    // Measured concurrent workload
    const latencies: number[] = [];
    let errorCount = 0;
    let totalAccepted = 0;
    let nextIdx = 0;

    const benchStart = performance.now();
    const worker = async () => {
      while (true) {
        const idx = nextIdx++;
        if (idx >= MEASURED_BATCHES) break;
        const r = await sendBatch(idx, `bench-${writeMode}`);
        latencies.push(r.elapsedMs);
        totalAccepted += r.accepted;
        if (r.status !== 200 || r.accepted !== BATCH_SIZE) {
          errorCount++;
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    const durationMs = performance.now() - benchStart;
    const durationSec = durationMs / 1000;

    latencies.sort((a, b) => a - b);

    // Post-run correctness verification against PostgreSQL
    const persistedCount = await telemetryRepo.countObservations();
    const expectedTotalRows = (WARMUP_BATCHES + MEASURED_BATCHES) * BATCH_SIZE;

    // Capture EXPLAIN (ANALYZE, BUFFERS) on representative DMA balance range query (on UNNEST run)
    let explainPlan: string[] | undefined;
    if (writeMode === 'UNNEST') {
      await pool.query('ANALYZE telemetry_observations;');
      const expRes = await pool.query<{ 'QUERY PLAN': string }>(
        `
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT observation_id, meter_id, value, observed_at
        FROM telemetry_observations
        WHERE dma_id = $1
          AND metric = 'FLOW_M3H'
          AND observed_at >= $2
          AND observed_at <= $3
          AND quality IN ('VALID', 'SUSPECT')
        ORDER BY observed_at ASC, meter_id ASC
        `,
        [
          'DMA-YASAMAL-04',
          new Date(baseMs - 15 * 60 * 1000).toISOString(),
          new Date(baseMs).toISOString(),
        ]
      );
      explainPlan = expRes.rows.map((r) => r['QUERY PLAN']);
    }

    return {
      writeMode,
      pgVersion,
      seed: SEED,
      warmupBatches: WARMUP_BATCHES,
      measuredBatches: MEASURED_BATCHES,
      batchSize: BATCH_SIZE,
      measuredObservations: MEASURED_BATCHES * BATCH_SIZE,
      concurrency: CONCURRENCY,
      durationMs: Number(durationMs.toFixed(2)),
      requestsPerSec: Number((MEASURED_BATCHES / durationSec).toFixed(2)),
      observationsPerSec: Number(((MEASURED_BATCHES * BATCH_SIZE) / durationSec).toFixed(2)),
      latencyMs: {
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        p99: percentile(latencies, 99),
        min: Number(latencies[0].toFixed(2)),
        max: Number(latencies[latencies.length - 1].toFixed(2)),
      },
      errorCount,
      correctnessCheck: {
        expectedPersistedRows: expectedTotalRows,
        actualPersistedRows: persistedCount,
        acceptedMatchesExpected: totalAccepted === MEASURED_BATCHES * BATCH_SIZE,
        passed: persistedCount === expectedTotalRows && errorCount === 0,
      },
      explainPlan,
    };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
}

async function main() {
  const before = await runModeBenchmark('ROW_BY_ROW');
  const after = await runModeBenchmark('UNNEST');

  const speedupRatio = Number((after.observationsPerSec / before.observationsPerSec).toFixed(2));
  const p95ReductionPct = Number(
    (((before.latencyMs.p95 - after.latencyMs.p95) / before.latencyMs.p95) * 100).toFixed(1)
  );

  const report = {
    executedAt: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.release()} (${os.arch()})`,
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      cpuCores: os.cpus().length,
      totalMemoryGb: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
      postgresVersion: after.pgVersion,
    },
    beforeRowByRow: before,
    afterUnnestBatch: after,
    improvementSummary: {
      optimization: 'Replaced per-observation SQL INSERT loop with single parameterized UNNEST bulk upsert per batch',
      throughputSpeedupX: speedupRatio,
      p95LatencyReductionPct: p95ReductionPct,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  if (!before.correctnessCheck.passed || !after.correctnessCheck.passed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[benchmark] FAILED:', err);
  process.exit(1);
});
