-- ============================================================================
-- SAMT (Su Əməliyyatlarının Mərkəzləşdirilmiş Təhlili)
-- OPTIONAL TARGET ARCHITECTURE EXTENSIONS SCHEMA (TimescaleDB + PostGIS)
--
-- IMPORTANT (SAMT v1.1.0 Scope Clarification):
-- 1. The EXECUTABLE baseline database schema for SAMT v1.1.0 runs on standard
--    PostgreSQL 16 and lives in:
--      `server/migrations/001_initial_schema.sql`
-- 2. This file preserves OPTIONAL future production extensions (PostGIS spatial
--    geometry columns/GIST indexes and TimescaleDB hypertable chunking/compression)
--    documented in the Target Architecture (ADR-001). It is NOT executed in v1.1.0.
-- 3. RETIRED AGGREGATE NOTICE:
--    The earlier v1.0.1 materialized view `dma_water_balance_15m` computed
--    `AVG(CASE WHEN metric = 'FLOW_M3H' AND meter_role = 'INLET' THEN value END) * 0.25`.
--    That formula was mathematically incorrect whenever a DMA had multiple inlet
--    meters (it averaged meters instead of summing them), irregular sampling
--    intervals, or missing data. It is RETIRED in v1.1.0.
--    Authoritative per-meter clipped trapezoidal integration is executed in the
--    shared TypeScript domain core (`prototype/src/domain/balance/flowIntegration.ts`),
--    which integrates each meter independently before summing boundary volumes.
-- ============================================================================

-- Optional Extensions (Target Production Deployment Only)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Optional Spatial Columns (Extension over `server/migrations/001_initial_schema.sql`)
-- ALTER TABLE dma_zones ADD COLUMN IF NOT EXISTS boundary GEOMETRY(Polygon, 4326);
-- CREATE INDEX IF NOT EXISTS idx_dma_boundary_gist ON dma_zones USING GIST (boundary);
--
-- ALTER TABLE network_meters ADD COLUMN IF NOT EXISTS location GEOMETRY(Point, 4326);
-- CREATE INDEX IF NOT EXISTS idx_meter_location_gist ON network_meters USING GIST (location);

-- Optional Physical Pipe Network Table (Target Spatial GIS Extension)
CREATE TABLE IF NOT EXISTS pipe_segments (
    segment_id VARCHAR(32) PRIMARY KEY,
    dma_id VARCHAR(32) NOT NULL REFERENCES dma_zones(dma_id) ON DELETE RESTRICT,
    material VARCHAR(32) NOT NULL,
    diameter_mm INTEGER NOT NULL CHECK (diameter_mm > 0),
    installation_year INTEGER NOT NULL CHECK (installation_year BETWEEN 1900 AND 2100),
    soil_corrosivity VARCHAR(16) NOT NULL CHECK (soil_corrosivity IN ('LOW', 'MEDIUM', 'HIGH')),
    break_history_count INTEGER NOT NULL DEFAULT 0 CHECK (break_history_count >= 0),
    consequence_factor NUMERIC(4, 2) NOT NULL CHECK (consequence_factor BETWEEN 1.0 AND 10.0),
    risk_priority_number NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    geometry GEOMETRY(LineString, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pipe_geometry ON pipe_segments USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_pipe_dma ON pipe_segments(dma_id);

-- Optional TimescaleDB Hypertable Conversion (Future Multi-Year High-Frequency Retention)
-- Requires converting primary/unique constraints to include `observed_at`:
-- SELECT create_hypertable('telemetry_observations', 'observed_at', chunk_time_interval => INTERVAL '7 days');
-- ALTER TABLE telemetry_observations SET (
--     timescaledb.compress,
--     timescaledb.compress_segmentby = 'dma_id, metric, meter_id',
--     timescaledb.compress_orderby = 'observed_at DESC'
-- );
-- SELECT add_compression_policy('telemetry_observations', INTERVAL '3 days');
-- SELECT add_retention_policy('telemetry_observations', INTERVAL '90 days');

-- RETIRED: `dma_water_balance_15m` cross-meter AVG()*0.25 continuous aggregate removed.
-- Do NOT reintroduce cross-meter averaging; always integrate per meter over elapsed
-- time intervals (`flowIntegration.ts`) and sum boundary meter volumes afterward.
