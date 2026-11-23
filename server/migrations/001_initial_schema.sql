-- ============================================================================
-- SAMT v1.1.0 Executable Baseline Migration 001: Initial Operational Schema
-- Target Engine: Standard PostgreSQL 16 (no TimescaleDB/PostGIS extensions required)
-- Course Grounding: resources/lectures_merged.pdf pp. 4-5, 11-12, 32, 117, 126
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1. District Metered Areas (DMA) Registry
CREATE TABLE IF NOT EXISTS dma_zones (
    dma_id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    administrative_district VARCHAR(64) NOT NULL,
    estimated_population INTEGER NOT NULL CHECK (estimated_population > 0),
    total_pipe_length_km NUMERIC(8, 2) NOT NULL CHECK (total_pipe_length_km >= 0),
    baseline_mnf_m3h NUMERIC(10, 3) NOT NULL CHECK (baseline_mnf_m3h >= 0),
    baseline_pressure_bar NUMERIC(6, 3) NOT NULL DEFAULT 4.0 CHECK (baseline_pressure_bar > 0),
    expected_sample_interval_sec INTEGER NOT NULL DEFAULT 15 CHECK (expected_sample_interval_sec > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Meter Registry (binds device -> meter -> DMA, enforces metric/role/unit compatibility)
CREATE TABLE IF NOT EXISTS network_meters (
    meter_id VARCHAR(32) PRIMARY KEY,
    dma_id VARCHAR(32) NOT NULL REFERENCES dma_zones(dma_id) ON DELETE RESTRICT,
    bound_device_id VARCHAR(64) NOT NULL,
    meter_role VARCHAR(24) NOT NULL CHECK (meter_role IN ('INLET', 'OUTLET', 'CONSUMER', 'PRESSURE_MONITOR')),
    allowed_metrics TEXT[] NOT NULL CHECK (cardinality(allowed_metrics) > 0),
    canonical_unit VARCHAR(16) NOT NULL CHECK (canonical_unit IN ('m3/h', 'bar', 'm')),
    name VARCHAR(128) NOT NULL,
    min_normal_value NUMERIC(12, 4) NOT NULL DEFAULT 0.0 CHECK (min_normal_value >= 0.0),
    max_normal_value NUMERIC(12, 4) NOT NULL CHECK (max_normal_value >= min_normal_value),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_network_meters_dma_active ON network_meters (dma_id, is_active, meter_role);
CREATE INDEX IF NOT EXISTS idx_network_meters_device ON network_meters (bound_device_id);

-- 3. Durable Telemetry Observations (per-meter deduplication + time-range lookup)
CREATE TABLE IF NOT EXISTS telemetry_observations (
    id BIGSERIAL PRIMARY KEY,
    observation_id VARCHAR(128) NOT NULL,
    meter_id VARCHAR(32) NOT NULL REFERENCES network_meters(meter_id) ON DELETE RESTRICT,
    dma_id VARCHAR(32) NOT NULL REFERENCES dma_zones(dma_id) ON DELETE RESTRICT,
    device_id VARCHAR(64) NOT NULL,
    metric VARCHAR(24) NOT NULL CHECK (metric IN ('FLOW_M3H', 'PRESSURE_BAR', 'LEVEL_METERS')),
    canonical_unit VARCHAR(16) NOT NULL CHECK (canonical_unit IN ('m3/h', 'bar', 'm')),
    value DOUBLE PRECISION NOT NULL CHECK (value >= 0.0 AND value <> 'NaN'::double precision AND value <> 'Infinity'::double precision),
    observed_at TIMESTAMPTZ NOT NULL,
    transmitted_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    quality VARCHAR(16) NOT NULL CHECK (quality IN ('VALID', 'SUSPECT', 'QUARANTINED')),
    quality_reason TEXT,
    ingestion_mode VARCHAR(24) NOT NULL CHECK (ingestion_mode IN ('LIVE', 'HISTORICAL_REPLAY')),
    battery_volts DOUBLE PRECISION CHECK (battery_volts IS NULL OR (battery_volts >= 0.0 AND battery_volts <= 12.0)),
    batch_correlation_id VARCHAR(64) NOT NULL,
    CONSTRAINT uq_telemetry_meter_observation UNIQUE (meter_id, observation_id)
);
-- Justified composite indexes for balance, MNF, and per-meter time-range queries:
CREATE INDEX IF NOT EXISTS idx_telemetry_dma_metric_observed
    ON telemetry_observations (dma_id, metric, observed_at DESC)
    WHERE quality IN ('VALID', 'SUSPECT');
CREATE INDEX IF NOT EXISTS idx_telemetry_meter_observed
    ON telemetry_observations (meter_id, observed_at DESC);

-- 4. Leak Incidents (Optimistic Concurrency via version CAS + structured JSONB evidence)
CREATE TABLE IF NOT EXISTS leak_incidents (
    incident_id VARCHAR(64) PRIMARY KEY,
    dma_id VARCHAR(32) NOT NULL REFERENCES dma_zones(dma_id) ON DELETE RESTRICT,
    pipe_segment_id VARCHAR(64),
    title VARCHAR(256) NOT NULL,
    state VARCHAR(24) NOT NULL CHECK (state IN ('DETECTED', 'ASSIGNED', 'IN_REPAIR', 'REPAIRED', 'VERIFIED', 'CLOSED', 'FALSE_ALARM')),
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'CRITICAL', 'EMERGENCY')),
    estimated_loss_m3h DOUBLE PRECISION NOT NULL CHECK (estimated_loss_m3h >= 0.0),
    detected_at TIMESTAMPTZ NOT NULL,
    crew_assignment JSONB,
    repair_evidence JSONB,
    verification_result JSONB,
    closed_at TIMESTAMPTZ,
    closed_by VARCHAR(64),
    false_alarm_reason TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incidents_dma_detected
    ON leak_incidents (dma_id, detected_at DESC, incident_id ASC);
CREATE INDEX IF NOT EXISTS idx_incidents_state
    ON leak_incidents (state, detected_at DESC);

-- 5. Idempotent Incident Commands (single-database at-most-once command ledger)
CREATE TABLE IF NOT EXISTS incident_commands (
    command_id VARCHAR(128) PRIMARY KEY,
    incident_id VARCHAR(64) NOT NULL REFERENCES leak_incidents(incident_id) ON DELETE CASCADE,
    actor_id VARCHAR(64) NOT NULL,
    actor_role VARCHAR(32) NOT NULL,
    event_type VARCHAR(48) NOT NULL,
    expected_version INTEGER NOT NULL CHECK (expected_version >= 1),
    payload_hash VARCHAR(64) NOT NULL,
    response_status INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incident_commands_incident
    ON incident_commands (incident_id, created_at DESC);

-- 6. Durable Audit Log (committed in the same ACID transaction as state changes)
CREATE TABLE IF NOT EXISTS audit_events (
    audit_id VARCHAR(64) PRIMARY KEY,
    event_timestamp TIMESTAMPTZ NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    source_component VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('INFO', 'WARN', 'ERROR', 'SUCCESS')),
    actor_id VARCHAR(64) NOT NULL,
    actor_role VARCHAR(32) NOT NULL,
    correlation_id VARCHAR(64) NOT NULL,
    dma_id VARCHAR(32),
    incident_id VARCHAR(64),
    message TEXT NOT NULL,
    metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_audit_incident_time
    ON audit_events (incident_id, event_timestamp DESC)
    WHERE incident_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_dma_time
    ON audit_events (dma_id, event_timestamp DESC)
    WHERE dma_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_time
    ON audit_events (event_timestamp DESC);

-- 7. Transactional Notification Outbox (bounded retries + idempotent local delivery)
CREATE TABLE IF NOT EXISTS notification_outbox (
    outbox_id VARCHAR(64) PRIMARY KEY,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    incident_id VARCHAR(64) REFERENCES leak_incidents(incident_id) ON DELETE SET NULL,
    dma_id VARCHAR(32),
    recipient VARCHAR(128) NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('INFO', 'WARN', 'CRITICAL')),
    message TEXT NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DELIVERED', 'DEAD_LETTERED')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending
    ON notification_outbox (status, next_attempt_at ASC)
    WHERE status = 'PENDING';

-- 8. Constrained Water Allocation Runs (auditable decision ledger)
CREATE TABLE IF NOT EXISTS allocation_runs (
    run_id VARCHAR(64) PRIMARY KEY,
    region_id VARCHAR(64) NOT NULL,
    canal_network_id VARCHAR(64) NOT NULL,
    volume_unit VARCHAR(24) NOT NULL CHECK (volume_unit IN ('THOUSAND_M3', 'M3')),
    delivery_horizon_hours INTEGER NOT NULL CHECK (delivery_horizon_hours > 0),
    total_supply DOUBLE PRECISION NOT NULL CHECK (total_supply >= 0),
    total_allocated DOUBLE PRECISION NOT NULL CHECK (total_allocated >= 0),
    unmet_demand DOUBLE PRECISION NOT NULL CHECK (unmet_demand >= 0),
    residual_supply DOUBLE PRECISION NOT NULL CHECK (residual_supply >= 0),
    gini_index DOUBLE PRECISION,
    actor_id VARCHAR(64) NOT NULL,
    correlation_id VARCHAR(64) NOT NULL,
    result_payload JSONB NOT NULL,
    solved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_allocation_runs_region
    ON allocation_runs (region_id, solved_at DESC);
