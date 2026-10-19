-- ============================================================================
-- SƏMT (Su Əməliyyatlarının Mərkəzləşdirilmiş Təhlili)
-- Proposed Target Database Schema (PostgreSQL 16 + PostGIS 3.4 + TimescaleDB 2.14)
-- Grounded in merged lecture notes (pp. 1-20: Storage) & Lecture 2 (Data Models).
--
-- STATUS: PROPOSED TARGET SCHEMA (Execution blocked in client-only demo workspace).
-- ============================================================================

-- 0. Required Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. District Metered Areas (DMA) Spatial Boundary Table
CREATE TABLE dma_zones (
    dma_id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    administrative_district VARCHAR(64) NOT NULL, -- e.g., Yasamal, Nəsimi, Nizami
    boundary GEOMETRY(Polygon, 4326) NOT NULL,
    estimated_population INTEGER NOT NULL CHECK (estimated_population > 0),
    total_pipe_length_km NUMERIC(8, 2) NOT NULL CHECK (total_pipe_length_km >= 0),
    baseline_mnf_m3h NUMERIC(8, 3) NOT NULL DEFAULT 0.0 CHECK (baseline_mnf_m3h >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dma_boundary ON dma_zones USING GIST (boundary);

-- 2. Physical Pipe Network Infrastructure Table
CREATE TABLE pipe_segments (
    segment_id VARCHAR(32) PRIMARY KEY,
    dma_id VARCHAR(32) NOT NULL REFERENCES dma_zones(dma_id) ON DELETE RESTRICT,
    material VARCHAR(32) NOT NULL, -- Cast-Iron, Asbestos-Cement, Steel, HDPE
    diameter_mm INTEGER NOT NULL CHECK (diameter_mm > 0),
    installation_year INTEGER NOT NULL CHECK (installation_year BETWEEN 1900 AND 2100),
    soil_corrosivity VARCHAR(16) NOT NULL CHECK (soil_corrosivity IN ('LOW', 'MEDIUM', 'HIGH')),
    break_history_count INTEGER NOT NULL DEFAULT 0 CHECK (break_history_count >= 0),
    consequence_factor NUMERIC(4, 2) NOT NULL CHECK (consequence_factor BETWEEN 1.0 AND 10.0),
    risk_priority_number NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    geometry GEOMETRY(LineString, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pipe_geometry ON pipe_segments USING GIST (geometry);
CREATE INDEX idx_pipe_dma ON pipe_segments(dma_id);

-- 3. Meter Registry Table (Reconciles device role and boundary associations)
CREATE TABLE network_meters (
    meter_id VARCHAR(32) PRIMARY KEY,
    dma_id VARCHAR(32) NOT NULL REFERENCES dma_zones(dma_id) ON DELETE RESTRICT,
    meter_role VARCHAR(24) NOT NULL CHECK (meter_role IN ('INLET', 'OUTLET', 'CONSUMER', 'PRESSURE_MONITOR')),
    name VARCHAR(128) NOT NULL,
    min_normal_value NUMERIC(10, 4) NOT NULL DEFAULT 0.0,
    max_normal_value NUMERIC(10, 4) NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_meter_location ON network_meters USING GIST (location);
CREATE INDEX idx_meter_dma_role ON network_meters (dma_id, meter_role);

-- 4. High-Frequency Telemetry Hypertable (TimescaleDB)
CREATE TABLE telemetry_measurements (
    time TIMESTAMPTZ NOT NULL,
    meter_id VARCHAR(32) NOT NULL REFERENCES network_meters(meter_id),
    dma_id VARCHAR(32) NOT NULL REFERENCES dma_zones(dma_id),
    metric VARCHAR(24) NOT NULL CHECK (metric IN ('FLOW_M3H', 'PRESSURE_BAR', 'LEVEL_METERS')),
    value NUMERIC(10, 4) NOT NULL CHECK (value >= 0.0), -- Flow and pressure non-negative
    quality_flag SMALLINT NOT NULL DEFAULT 0 CHECK (quality_flag BETWEEN 0 AND 3)
);

-- Partition into 7-day automated chunks
SELECT create_hypertable('telemetry_measurements', 'time', chunk_time_interval => INTERVAL '7 days');

-- Optimized indexes for time-series range lookups
CREATE INDEX idx_telemetry_meter_time ON telemetry_measurements (meter_id, time DESC);
CREATE INDEX idx_telemetry_dma_metric_time ON telemetry_measurements (dma_id, metric, time DESC);

-- Native columnar compression policy (Gorilla + Delta-of-delta)
ALTER TABLE telemetry_measurements SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'dma_id, metric, meter_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('telemetry_measurements', INTERVAL '3 days');
SELECT add_retention_policy('telemetry_measurements', INTERVAL '90 days');

-- 5. Unified 15-Minute Continuous Aggregate View
-- Integrates average flow rate over time bucket (m³/h * 0.25h duration = true volume)
-- Resolves the previous SUM(value * 0.25) bug which multiplied every sample instead of averaging
CREATE MATERIALIZED VIEW dma_water_balance_15m
WITH (timescaledb.continuous) AS
SELECT 
    t.dma_id,
    time_bucket(INTERVAL '15 minutes', t.time) AS bucket,
    -- Average pressure across transducers
    AVG(CASE WHEN t.metric = 'PRESSURE_BAR' THEN t.value END) AS avg_pressure_bar,
    -- True volume: Average flow rate (m³/h) multiplied by 0.25 hours (15 minutes)
    AVG(CASE WHEN t.metric = 'FLOW_M3H' AND m.meter_role = 'INLET' THEN t.value END) * 0.25 AS total_inflow_m3,
    AVG(CASE WHEN t.metric = 'FLOW_M3H' AND m.meter_role = 'OUTLET' THEN t.value END) * 0.25 AS total_outflow_m3,
    COUNT(t.value) AS sample_count
FROM telemetry_measurements t
JOIN network_meters m ON t.meter_id = m.meter_id
GROUP BY t.dma_id, bucket;

-- Configure Continuous Aggregate Refresh Policy
SELECT add_continuous_aggregate_policy('dma_water_balance_15m',
    start_offset => INTERVAL '3 days',
    end_offset   => INTERVAL '15 minutes',
    schedule_interval => INTERVAL '15 minutes');

-- 6. Canonical Leak Incident & Work Order Lifecycle Table
CREATE TYPE incident_state_enum AS ENUM (
    'DETECTED', 'ASSIGNED', 'IN_REPAIR', 'REPAIRED', 'VERIFIED', 'CLOSED', 'FALSE_ALARM'
);

CREATE TABLE leak_incidents (
    incident_id VARCHAR(36) PRIMARY KEY,
    dma_id VARCHAR(32) NOT NULL REFERENCES dma_zones(dma_id),
    pipe_segment_id VARCHAR(32) REFERENCES pipe_segments(segment_id),
    title VARCHAR(128) NOT NULL,
    state incident_state_enum NOT NULL DEFAULT 'DETECTED',
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'CRITICAL', 'EMERGENCY')),
    estimated_loss_m3h NUMERIC(8, 2) NOT NULL CHECK (estimated_loss_m3h >= 0.0),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    crew_id VARCHAR(32),
    crew_name VARCHAR(64),
    crew_phone VARCHAR(32),
    assigned_at TIMESTAMPTZ,
    repair_method VARCHAR(128),
    repair_evidence_ref VARCHAR(256),
    repaired_at TIMESTAMPTZ,
    verified_loss_drop_m3h NUMERIC(8, 2),
    verified_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    false_alarm_reason TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX idx_incident_state ON leak_incidents(state);
CREATE INDEX idx_incident_dma ON leak_incidents(dma_id);

-- 7. Constrained Water Allocation Ledger Table
CREATE TABLE allocation_ledger (
    allocation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region_id VARCHAR(32) NOT NULL,
    canal_network_id VARCHAR(32) NOT NULL,
    consumer_id VARCHAR(32) NOT NULL,
    consumer_name VARCHAR(128) NOT NULL,
    requested_demand_m3 NUMERIC(12, 2) NOT NULL CHECK (requested_demand_m3 >= 0.0),
    allocated_volume_m3 NUMERIC(12, 2) NOT NULL CHECK (allocated_volume_m3 >= 0.0),
    satisfaction_pct INTEGER NOT NULL CHECK (satisfaction_pct BETWEEN 0 AND 100),
    reason_code VARCHAR(48) NOT NULL,
    solved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_allocation_region_time ON allocation_ledger(region_id, solved_at DESC);
