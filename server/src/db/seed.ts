/**
 * Deterministic Synthetic Seeder for SAMT v1.1.0
 * Seeds two primary test DMAs (DMA-YASAMAL-04 operational workflow, DMA-NASIMI-02 isolation)
 * plus topology reference DMAs (DMA-NIZAMI-07, DMA-SABAIL-01) and their bound meters.
 * Idempotent: safe to run repeatedly without duplicating records.
 */

import { pathToFileURL } from 'node:url';
import { loadConfig, redactDatabaseUrl } from '../config.js';
import { createDbPool, type DbPool } from './pool.js';
import { runMigrations } from './migrate.js';
import { INITIAL_METERS } from '../../../prototype/src/domain/adapters/StandardMeterRegistry.js';

export interface SeedDma {
  dmaId: string;
  name: string;
  administrativeDistrict: string;
  estimatedPopulation: number;
  totalPipeLengthKm: number;
  baselineMnfM3h: number;
  baselinePressureBar: number;
  expectedSampleIntervalSec: number;
}

export const SEED_DMAS: SeedDma[] = [
  {
    dmaId: 'DMA-YASAMAL-04',
    name: 'Yasamal DMA-04 (H. Cavid)',
    administrativeDistrict: 'Yasamal',
    estimatedPopulation: 42500,
    totalPipeLengthKm: 38.4,
    baselineMnfM3h: 25.0,
    baselinePressureBar: 4.0,
    expectedSampleIntervalSec: 15,
  },
  {
    dmaId: 'DMA-NASIMI-02',
    name: 'Nəsimi DMA-02 (28 May)',
    administrativeDistrict: 'Nəsimi',
    estimatedPopulation: 54000,
    totalPipeLengthKm: 44.2,
    baselineMnfM3h: 34.0,
    baselinePressureBar: 4.0,
    expectedSampleIntervalSec: 15,
  },
  {
    dmaId: 'DMA-NIZAMI-07',
    name: 'Nizami DMA-07 (Q. Qarayev)',
    administrativeDistrict: 'Nizami',
    estimatedPopulation: 61200,
    totalPipeLengthKm: 51.0,
    baselineMnfM3h: 40.0,
    baselinePressureBar: 4.2,
    expectedSampleIntervalSec: 15,
  },
  {
    dmaId: 'DMA-SABAIL-01',
    name: 'Səbail DMA-01 (İçərişəhər)',
    administrativeDistrict: 'Səbail',
    estimatedPopulation: 29800,
    totalPipeLengthKm: 24.5,
    baselineMnfM3h: 20.0,
    baselinePressureBar: 3.8,
    expectedSampleIntervalSec: 15,
  },
];

export async function seedDatabase(pool: DbPool): Promise<{ dmaCount: number; meterCount: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const dma of SEED_DMAS) {
      await client.query(
        `
        INSERT INTO dma_zones (
          dma_id, name, administrative_district, estimated_population,
          total_pipe_length_km, baseline_mnf_m3h, baseline_pressure_bar,
          expected_sample_interval_sec
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (dma_id) DO UPDATE SET
          name = EXCLUDED.name,
          administrative_district = EXCLUDED.administrative_district,
          baseline_mnf_m3h = EXCLUDED.baseline_mnf_m3h,
          baseline_pressure_bar = EXCLUDED.baseline_pressure_bar,
          expected_sample_interval_sec = EXCLUDED.expected_sample_interval_sec,
          updated_at = NOW();
        `,
        [
          dma.dmaId,
          dma.name,
          dma.administrativeDistrict,
          dma.estimatedPopulation,
          dma.totalPipeLengthKm,
          dma.baselineMnfM3h,
          dma.baselinePressureBar,
          dma.expectedSampleIntervalSec,
        ]
      );
    }

    for (const meter of INITIAL_METERS) {
      const allowedMetrics =
        meter.allowedMetrics ??
        (meter.role === 'PRESSURE_MONITOR' ? ['PRESSURE_BAR'] : ['FLOW_M3H']);
      const canonicalUnit =
        meter.canonicalUnit ?? (meter.role === 'PRESSURE_MONITOR' ? 'bar' : 'm3/h');

      await client.query(
        `
        INSERT INTO network_meters (
          meter_id, dma_id, bound_device_id, meter_role, allowed_metrics,
          canonical_unit, name, min_normal_value, max_normal_value, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (meter_id) DO UPDATE SET
          dma_id = EXCLUDED.dma_id,
          bound_device_id = EXCLUDED.bound_device_id,
          meter_role = EXCLUDED.meter_role,
          allowed_metrics = EXCLUDED.allowed_metrics,
          canonical_unit = EXCLUDED.canonical_unit,
          name = EXCLUDED.name,
          min_normal_value = EXCLUDED.min_normal_value,
          max_normal_value = EXCLUDED.max_normal_value,
          is_active = EXCLUDED.is_active;
        `,
        [
          meter.meterId,
          meter.dmaId,
          meter.boundDeviceId ?? `GW-${meter.dmaId}`,
          meter.role,
          allowedMetrics,
          canonicalUnit,
          meter.name,
          meter.minNormalValue,
          meter.maxNormalValue,
          meter.isActive ?? true,
        ]
      );
    }

    await client.query('COMMIT');
    return { dmaCount: SEED_DMAS.length, meterCount: INITIAL_METERS.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function resetOperationalTables(pool: DbPool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      notification_outbox,
      audit_events,
      incident_commands,
      leak_incidents,
      telemetry_observations,
      allocation_runs
    RESTART IDENTITY CASCADE;
  `);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  (async () => {
    const config = loadConfig();
    const pool = createDbPool(config.databaseUrl);
    try {
      console.log(`[seed] Connecting to ${redactDatabaseUrl(config.databaseUrl)}`);
      await runMigrations(pool);
      const counts = await seedDatabase(pool);
      console.log(
        `[seed] Seeded ${counts.dmaCount} DMAs and ${counts.meterCount} bound network meters.`
      );
    } finally {
      await pool.end();
    }
  })().catch((err) => {
    console.error('[seed] FAILED:', err);
    process.exit(1);
  });
}
