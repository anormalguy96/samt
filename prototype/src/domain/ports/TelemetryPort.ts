/**
 * Telemetry Port & Data Contracts (Lectures 2 & 3: Data Models & Interface Contracts)
 * Establishes canonical telemetry fields, physical units, meter/device bindings, and quality flags.
 */

export type MetricType = 'FLOW_M3H' | 'PRESSURE_BAR' | 'LEVEL_METERS';

export type CanonicalUnit = 'm3/h' | 'bar' | 'm';

export const METRIC_CANONICAL_UNITS: Record<MetricType, CanonicalUnit> = {
  FLOW_M3H: 'm3/h',
  PRESSURE_BAR: 'bar',
  LEVEL_METERS: 'm',
};

export type ObservationQuality =
  | 'VALID'       // Passed all schema, range, binding, and timing constraints
  | 'SUSPECT'     // Minor anomaly (e.g. battery < 3.0V)
  | 'QUARANTINED' // Future clock skew or severe timing violation held for investigation
  | 'REJECTED';   // Malformed, duplicate ID, unauthenticated, unknown/inactive meter, or wrong binding

export type IngestionMode = 'LIVE' | 'HISTORICAL_REPLAY';

export interface TelemetryObservationInput {
  observationId: string;
  deviceId: string;
  meterId: string;
  dmaId: string;
  metric: MetricType;
  unit?: CanonicalUnit;
  value: number;
  observedAt: Date;
  transmittedAt?: Date;
  /** Caller-supplied hint; never bypasses auth or server age/skew bounds */
  callerHistoricalHint?: boolean;
  batteryVolts?: number;
}

export interface TelemetryObservation {
  observationId: string;
  deviceId: string;
  meterId: string;
  dmaId: string;
  metric: MetricType;
  canonicalUnit?: CanonicalUnit;
  value: number;
  observedAt: Date;
  transmittedAt?: Date;
  /** @deprecated Alias for transmittedAt retained for backward compatibility */
  sentAt?: Date;
  /** Server-owned arrival timestamp derived from authoritative Clock */
  receivedAt: Date;
  quality: ObservationQuality;
  qualityReason?: string;
  ingestionMode?: IngestionMode;
  batteryVolts?: number;
}

export type MeterRole = 'INLET' | 'OUTLET' | 'CONSUMER' | 'PRESSURE_MONITOR';

export interface MeterDefinition {
  meterId: string;
  dmaId: string;
  role: MeterRole;
  name: string;
  minNormalValue: number;
  maxNormalValue: number;
  isActive?: boolean;
  boundDeviceId?: string;
  allowedMetrics?: MetricType[];
  canonicalUnit?: CanonicalUnit;
}

export interface MeterRegistry {
  getMeter(meterId: string): MeterDefinition | undefined;
  getMetersForDma(dmaId: string): MeterDefinition[];
  getAllMeters(): MeterDefinition[];
}

export interface ObservationDedupStore {
  has(meterId: string, observationId: string): boolean | Promise<boolean>;
  add(meterId: string, observationId: string): void | Promise<void>;
  clear?(): void | Promise<void>;
}

export interface ITelemetrySink {
  ingest(observation: TelemetryObservation): Promise<{ accepted: boolean; quality: ObservationQuality; reason?: string }>;
  ingestBatch(observations: TelemetryObservation[]): Promise<{ acceptedCount: number; rejectedCount: number }>;
}

export interface ITelemetryRepository extends ITelemetrySink {
  getObservations(filter: {
    dmaId?: string;
    meterId?: string;
    metric?: MetricType;
    from: Date;
    to: Date;
    qualities?: ObservationQuality[];
  }): Promise<TelemetryObservation[]>;
  getLatestObservation(meterId: string): Promise<TelemetryObservation | undefined>;
}
