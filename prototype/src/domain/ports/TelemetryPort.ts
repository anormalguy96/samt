/**
 * Telemetry Port & Data Contracts (Lectures 2 & 3: Data Models & Interface Contracts)
 * Establishes canonical telemetry fields, physical units, meter roles, and quality flags.
 */

export type MetricType = 'FLOW_M3H' | 'PRESSURE_BAR' | 'LEVEL_METERS';

export type ObservationQuality = 
  | 'VALID'         // Passed all schema, range, and timing constraints
  | 'SUSPECT'       // Minor anomaly (e.g. slight battery low, non-critical jitter)
  | 'QUARANTINED'   // Severe anomaly or clock drift; held for investigation
  | 'REJECTED';     // Malformed, duplicate ID, unauthenticated, or invalid signature

export interface TelemetryObservation {
  observationId: string;
  deviceId: string;
  meterId: string;
  dmaId: string;
  metric: MetricType;
  value: number;
  observedAt: Date;
  sentAt?: Date;
  receivedAt: Date;
  quality: ObservationQuality;
  qualityReason?: string;
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
}

export interface MeterRegistry {
  getMeter(meterId: string): MeterDefinition | undefined;
  getMetersForDma(dmaId: string): MeterDefinition[];
  getAllMeters(): MeterDefinition[];
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
  }): Promise<TelemetryObservation[]>;
  getLatestObservation(meterId: string): Promise<TelemetryObservation | undefined>;
}
