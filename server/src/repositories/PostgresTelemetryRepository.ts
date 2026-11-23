/**
 * PostgreSQL Telemetry & Registry Repository (SAMT v1.1.0)
 * - Loads authoritative meter bindings from `network_meters`.
 * - Persists observations with durable UNIQUE (meter_id, observation_id) deduplication.
 * - Supports both single-query UNNEST batch upsert (default optimized path) and
 *   ROW_BY_ROW insert mode (baseline benchmark comparison).
 */

import type { DbPool } from '../db/pool.js';
import type { AuditEvent } from '../../../prototype/src/domain/ports/AuditPort.js';
import type {
  CanonicalUnit,
  IngestionMode,
  MeterDefinition,
  MeterRegistry,
  MeterRole,
  MetricType,
  ObservationQuality,
  TelemetryObservation,
} from '../../../prototype/src/domain/ports/TelemetryPort.js';
import { METRIC_CANONICAL_UNITS } from '../../../prototype/src/domain/ports/TelemetryPort.js';
import type {
  DurableTelemetryPersistenceResult,
  ITelemetryBatchPersistence,
} from '../../../prototype/src/application/IngestTelemetryBatchUseCase.js';
import type {
  DmaMetadata,
  ITelemetryQueryReader,
} from '../../../prototype/src/application/AssessDmaHydraulicsUseCase.js';

export type TelemetryWriteMode = 'UNNEST' | 'ROW_BY_ROW';

interface MeterRow {
  meter_id: string;
  dma_id: string;
  bound_device_id: string;
  meter_role: string;
  allowed_metrics: string[];
  canonical_unit: string;
  name: string;
  min_normal_value: number;
  max_normal_value: number;
  is_active: boolean;
}

interface ObservationRow {
  observation_id: string;
  meter_id: string;
  dma_id: string;
  device_id: string;
  metric: string;
  canonical_unit: string;
  value: number;
  observed_at: Date;
  transmitted_at: Date;
  received_at: Date;
  quality: string;
  quality_reason: string | null;
  ingestion_mode: string;
  battery_volts: number | null;
}

export class PostgresMeterRegistry implements MeterRegistry {
  private cache = new Map<string, MeterDefinition>();

  constructor(private pool: DbPool) {}

  async refresh(): Promise<void> {
    const res = await this.pool.query<MeterRow>(
      `
      SELECT meter_id, dma_id, bound_device_id, meter_role, allowed_metrics,
             canonical_unit, name, min_normal_value, max_normal_value, is_active
      FROM network_meters
      ORDER BY meter_id ASC
      `
    );
    const next = new Map<string, MeterDefinition>();
    for (const r of res.rows) {
      next.set(r.meter_id, {
        meterId: r.meter_id,
        dmaId: r.dma_id,
        boundDeviceId: r.bound_device_id,
        role: r.meter_role as MeterRole,
        allowedMetrics: [...(r.allowed_metrics as MetricType[])],
        canonicalUnit: r.canonical_unit as CanonicalUnit,
        name: r.name,
        minNormalValue: Number(r.min_normal_value),
        maxNormalValue: Number(r.max_normal_value),
        isActive: r.is_active,
      });
    }
    this.cache = next;
  }

  getMeter(meterId: string): MeterDefinition | undefined {
    const m = this.cache.get(meterId);
    return m ? { ...m, allowedMetrics: m.allowedMetrics ? [...m.allowedMetrics] : undefined } : undefined;
  }

  getMetersForDma(dmaId: string): MeterDefinition[] {
    return Array.from(this.cache.values())
      .filter((m) => m.dmaId === dmaId)
      .map((m) => ({ ...m, allowedMetrics: m.allowedMetrics ? [...m.allowedMetrics] : undefined }));
  }

  getAllMeters(): MeterDefinition[] {
    return Array.from(this.cache.values()).map((m) => ({
      ...m,
      allowedMetrics: m.allowedMetrics ? [...m.allowedMetrics] : undefined,
    }));
  }
}

export class PostgresTelemetryRepository
  implements ITelemetryBatchPersistence, ITelemetryQueryReader
{
  constructor(
    private pool: DbPool,
    private writeMode: TelemetryWriteMode = 'UNNEST'
  ) {}

  setWriteMode(mode: TelemetryWriteMode): void {
    this.writeMode = mode;
  }

  async listDmas(): Promise<DmaMetadata[]> {
    const res = await this.pool.query<{
      dma_id: string;
      name: string;
      administrative_district: string;
      baseline_mnf_m3h: number;
      baseline_pressure_bar: number;
      expected_sample_interval_sec: number;
    }>(
      `
      SELECT dma_id, name, administrative_district, baseline_mnf_m3h,
             baseline_pressure_bar, expected_sample_interval_sec
      FROM dma_zones
      ORDER BY dma_id ASC
      `
    );
    return res.rows.map((r) => ({
      dmaId: r.dma_id,
      name: r.name,
      administrativeDistrict: r.administrative_district,
      baselineMnfM3h: Number(r.baseline_mnf_m3h),
      baselinePressureBar: Number(r.baseline_pressure_bar),
      expectedSampleIntervalSec: Number(r.expected_sample_interval_sec),
    }));
  }

  async getDma(dmaId: string): Promise<DmaMetadata | undefined> {
    const res = await this.pool.query<{
      dma_id: string;
      name: string;
      administrative_district: string;
      baseline_mnf_m3h: number;
      baseline_pressure_bar: number;
      expected_sample_interval_sec: number;
    }>(
      `
      SELECT dma_id, name, administrative_district, baseline_mnf_m3h,
             baseline_pressure_bar, expected_sample_interval_sec
      FROM dma_zones
      WHERE dma_id = $1
      `,
      [dmaId]
    );
    const r = res.rows[0];
    if (!r) return undefined;
    return {
      dmaId: r.dma_id,
      name: r.name,
      administrativeDistrict: r.administrative_district,
      baselineMnfM3h: Number(r.baseline_mnf_m3h),
      baselinePressureBar: Number(r.baseline_pressure_bar),
      expectedSampleIntervalSec: Number(r.expected_sample_interval_sec),
    };
  }

  async persistObservations(
    observations: TelemetryObservation[],
    batchCorrelationId: string,
    auditEvent?: AuditEvent
  ): Promise<DurableTelemetryPersistenceResult> {
    const insertedObservationKeys = new Set<string>();
    const duplicateObservationKeys = new Set<string>();

    if (observations.length === 0) {
      return { insertedObservationKeys, duplicateObservationKeys };
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (this.writeMode === 'UNNEST') {
        const obsIds: string[] = [];
        const meterIds: string[] = [];
        const dmaIds: string[] = [];
        const deviceIds: string[] = [];
        const metrics: string[] = [];
        const units: string[] = [];
        const values: number[] = [];
        const observedAts: string[] = [];
        const transmittedAts: string[] = [];
        const receivedAts: string[] = [];
        const qualities: string[] = [];
        const qualityReasons: (string | null)[] = [];
        const modes: string[] = [];
        const batteries: (number | null)[] = [];
        const correlations: string[] = [];

        for (const o of observations) {
          obsIds.push(o.observationId);
          meterIds.push(o.meterId);
          dmaIds.push(o.dmaId);
          deviceIds.push(o.deviceId);
          metrics.push(o.metric);
          units.push(o.canonicalUnit ?? METRIC_CANONICAL_UNITS[o.metric]);
          values.push(o.value);
          observedAts.push(o.observedAt.toISOString());
          transmittedAts.push((o.transmittedAt ?? o.receivedAt).toISOString());
          receivedAts.push(o.receivedAt.toISOString());
          qualities.push(o.quality);
          qualityReasons.push(o.qualityReason ?? null);
          modes.push(o.ingestionMode ?? 'LIVE');
          batteries.push(o.batteryVolts ?? null);
          correlations.push(batchCorrelationId);
        }

        const inserted = await client.query<{ meter_id: string; observation_id: string }>(
          `
          INSERT INTO telemetry_observations (
            observation_id, meter_id, dma_id, device_id, metric, canonical_unit,
            value, observed_at, transmitted_at, received_at, quality, quality_reason,
            ingestion_mode, battery_volts, batch_correlation_id
          )
          SELECT * FROM UNNEST(
            $1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[],
            $6::varchar[], $7::double precision[], $8::timestamptz[], $9::timestamptz[],
            $10::timestamptz[], $11::varchar[], $12::text[], $13::varchar[],
            $14::double precision[], $15::varchar[]
          )
          ON CONFLICT (meter_id, observation_id) DO NOTHING
          RETURNING meter_id, observation_id
          `,
          [
            obsIds,
            meterIds,
            dmaIds,
            deviceIds,
            metrics,
            units,
            values,
            observedAts,
            transmittedAts,
            receivedAts,
            qualities,
            qualityReasons,
            modes,
            batteries,
            correlations,
          ]
        );

        for (const row of inserted.rows) {
          insertedObservationKeys.add(`${row.meter_id}::${row.observation_id}`);
        }
      } else {
        // Baseline unoptimized row-by-row insertion mode for before/after benchmark measurement
        for (const o of observations) {
          const res = await client.query<{ meter_id: string; observation_id: string }>(
            `
            INSERT INTO telemetry_observations (
              observation_id, meter_id, dma_id, device_id, metric, canonical_unit,
              value, observed_at, transmitted_at, received_at, quality, quality_reason,
              ingestion_mode, battery_volts, batch_correlation_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            ON CONFLICT (meter_id, observation_id) DO NOTHING
            RETURNING meter_id, observation_id
            `,
            [
              o.observationId,
              o.meterId,
              o.dmaId,
              o.deviceId,
              o.metric,
              o.canonicalUnit ?? METRIC_CANONICAL_UNITS[o.metric],
              o.value,
              o.observedAt.toISOString(),
              (o.transmittedAt ?? o.receivedAt).toISOString(),
              o.receivedAt.toISOString(),
              o.quality,
              o.qualityReason ?? null,
              o.ingestionMode ?? 'LIVE',
              o.batteryVolts ?? null,
              batchCorrelationId,
            ]
          );
          if (res.rows[0]) {
            insertedObservationKeys.add(`${res.rows[0].meter_id}::${res.rows[0].observation_id}`);
          }
        }
      }

      for (const o of observations) {
        const key = `${o.meterId}::${o.observationId}`;
        if (!insertedObservationKeys.has(key)) {
          duplicateObservationKeys.add(key);
        }
      }

      if (auditEvent) {
        await client.query(
          `
          INSERT INTO audit_events (
            audit_id, event_timestamp, event_type, source_component, severity,
            actor_id, actor_role, correlation_id, dma_id, incident_id, message, metadata
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          `,
          [
            auditEvent.id,
            auditEvent.timestamp.toISOString(),
            auditEvent.eventType,
            auditEvent.sourceComponent,
            auditEvent.severity,
            auditEvent.actorId ?? 'device',
            auditEvent.actorRole ?? 'device',
            batchCorrelationId,
            auditEvent.dmaId ?? null,
            auditEvent.incidentId ?? null,
            `${auditEvent.message}; inserted=${insertedObservationKeys.size}, duplicates=${duplicateObservationKeys.size}`,
            JSON.stringify({
              ...(auditEvent.metadata ?? {}),
              insertedCount: insertedObservationKeys.size,
              duplicateCount: duplicateObservationKeys.size,
            }),
          ]
        );
      }

      await client.query('COMMIT');
      return { insertedObservationKeys, duplicateObservationKeys };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private mapRow(r: ObservationRow): TelemetryObservation {
    return {
      observationId: r.observation_id,
      meterId: r.meter_id,
      dmaId: r.dma_id,
      deviceId: r.device_id,
      metric: r.metric as MetricType,
      canonicalUnit: r.canonical_unit as CanonicalUnit,
      value: Number(r.value),
      observedAt: new Date(r.observed_at),
      transmittedAt: new Date(r.transmitted_at),
      sentAt: new Date(r.transmitted_at),
      receivedAt: new Date(r.received_at),
      quality: r.quality as ObservationQuality,
      qualityReason: r.quality_reason ?? undefined,
      ingestionMode: r.ingestion_mode as IngestionMode,
      batteryVolts: r.battery_volts !== null ? Number(r.battery_volts) : undefined,
    };
  }

  async getFlowObservationsForDma(
    dmaId: string,
    from: Date,
    to: Date,
    options?: { excludeHistoricalReplay?: boolean }
  ): Promise<TelemetryObservation[]> {
    const params: unknown[] = [dmaId, 'FLOW_M3H', from.toISOString(), to.toISOString()];
    const modeFilter = options?.excludeHistoricalReplay ? `AND ingestion_mode = 'LIVE'` : '';

    const res = await this.pool.query<ObservationRow>(
      `
      SELECT observation_id, meter_id, dma_id, device_id, metric, canonical_unit,
             value, observed_at, transmitted_at, received_at, quality, quality_reason,
             ingestion_mode, battery_volts
      FROM telemetry_observations
      WHERE dma_id = $1
        AND metric = $2
        AND observed_at >= $3
        AND observed_at <= $4
        AND quality IN ('VALID', 'SUSPECT')
        ${modeFilter}
      ORDER BY observed_at ASC, meter_id ASC
      `,
      params
    );
    return res.rows.map((r) => this.mapRow(r));
  }

  async getPressureObservationsForDma(
    dmaId: string,
    from: Date,
    to: Date
  ): Promise<TelemetryObservation[]> {
    const res = await this.pool.query<ObservationRow>(
      `
      SELECT observation_id, meter_id, dma_id, device_id, metric, canonical_unit,
             value, observed_at, transmitted_at, received_at, quality, quality_reason,
             ingestion_mode, battery_volts
      FROM telemetry_observations
      WHERE dma_id = $1
        AND metric = 'PRESSURE_BAR'
        AND observed_at >= $2
        AND observed_at <= $3
        AND quality IN ('VALID', 'SUSPECT')
      ORDER BY observed_at ASC
      `,
      [dmaId, from.toISOString(), to.toISOString()]
    );
    return res.rows.map((r) => this.mapRow(r));
  }

  async countObservations(): Promise<number> {
    const res = await this.pool.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM telemetry_observations');
    return Number(res.rows[0]?.cnt ?? 0);
  }
}
