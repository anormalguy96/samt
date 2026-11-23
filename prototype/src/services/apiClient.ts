/**
 * SAMT v1.1.0 Typed HTTP API Client
 * Connects React UI to the real local Node/TypeScript + PostgreSQL /v1 API.
 * Never fabricates fallback data when the backend or PostgreSQL is unavailable.
 */

import type {
  Incident,
  IncidentEvent,
  IncidentSeverity,
  IncidentState,
  VerificationOutcome,
} from '../domain/ports/IncidentPort';
import type { AuditEvent } from '../domain/ports/AuditPort';
import type { AllocationPlanResult, ConsumerRequest } from '../domain/allocation/constrainedAllocation';

export type AuthPersona = 'dispatcher' | 'viewer';

export interface ApiErrorResult {
  ok: false;
  status: number;
  errorCode: string;
  message: string;
  currentVersion?: number | null;
  correlationId?: string;
  unavailable?: boolean;
}

export interface ApiSuccessResult<T> {
  ok: true;
  status: number;
  data: T;
  correlationId?: string;
}

export type ApiResult<T> = ApiSuccessResult<T> | ApiErrorResult;

export interface ReadyResponse {
  status: 'READY' | 'DEGRADED';
  database: 'UP' | 'DOWN';
  db_latency_ms?: number;
  version?: string;
}

export interface ApiBalanceResponse {
  dma_id: string;
  dma_name: string;
  window_start: string;
  window_end: string;
  total_inflow_m3: number;
  total_outflow_m3: number;
  measured_inflow_m3: number;
  measured_outflow_m3: number;
  net_boundary_flow_m3: number;
  authorized_consumption_m3: number;
  storage_change_m3: number;
  signed_residual_m3: number;
  unexplained_residual_fraction: number;
  coverage_ratio: number;
  uncertainty_m3: number;
  status: 'NOMINAL' | 'ELEVATED_LOSS' | 'CRITICAL_LEAK' | 'INSUFFICIENT_DATA';
  evidence_qualification: string;
  assumptions: string[];
  per_meter_integrations: {
    meter_id: string;
    role: string;
    status: string;
    total_volume_m3: number;
    measured_volume_m3: number;
    estimated_boundary_volume_m3: number;
    sample_count: number;
    coverage_ratio: number;
    max_gap_seconds: number;
  }[];
}

export interface ApiNightFlowResponse {
  dma_id: string;
  date_azt: string;
  window_start: string;
  window_end: string;
  avg_pressure_bar: number | null;
  status: 'INSUFFICIENT_COVERAGE' | 'NOMINAL' | 'ANOMALY_DETECTED';
  is_within_night_window: boolean;
  sample_count: number;
  coverage_ratio: number;
  percentile_5_flow_m3h: number;
  baseline_mnf_m3h: number;
  anomaly_threshold_m3h: number;
  excess_night_flow_m3h: number;
  is_anomaly_detected: boolean;
  detection_reason: string;
  methodology_note: string;
}

export interface ApiBatchIngestResponse {
  status: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'DUPLICATE_ONLY' | 'REJECTED';
  correlation_id: string;
  received_at: string;
  total_count: number;
  accepted_count: number;
  live_count: number;
  historical_count: number;
  duplicate_count: number;
  quarantined_count: number;
  rejected_count: number;
  triggered_live_dispatch: boolean;
  results: {
    observation_id: string;
    meter_id: string;
    accepted: boolean;
    code: string;
    quality: string;
    ingestion_mode: string;
    reason: string | null;
  }[];
}

const DEFAULT_TOKENS: Record<AuthPersona, string> = {
  dispatcher:
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DISPATCHER_TOKEN ||
    'samt-dev-dispatcher-token',
  viewer:
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_VIEWER_TOKEN ||
    'samt-dev-viewer-token',
};

const DEFAULT_DEVICE_TOKENS: Record<string, { token: string; deviceId: string; inletMeterId: string; outletMeterId: string; pressureMeterId: string }> = {
  'DMA-YASAMAL-04': {
    token: 'samt-dev-device-yas-01',
    deviceId: 'GW-YAS-01',
    inletMeterId: 'FM-YAS-INLET-01',
    outletMeterId: 'FM-YAS-OUTLET-01',
    pressureMeterId: 'PT-YAS-PRESSURE-01',
  },
  'DMA-NASIMI-02': {
    token: 'samt-dev-device-nas-01',
    deviceId: 'GW-NAS-01',
    inletMeterId: 'FM-NAS-INLET-01',
    outletMeterId: 'FM-NAS-OUTLET-01',
    pressureMeterId: 'PT-NAS-PRESSURE-01',
  },
};

export function getApiBaseUrl(): string {
  const configured = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return `${window.location.origin}/v1`;
  }
  return 'http://127.0.0.1:8080/v1';
}

export function getRootBaseUrl(): string {
  return getApiBaseUrl().replace(/\/v1$/, '');
}

export function getDeviceConfigForDma(dmaId: string) {
  return DEFAULT_DEVICE_TOKENS[dmaId] ?? null;
}

function deserializeIncident(raw: Record<string, unknown>): Incident {
  const crew = raw.crew_assignment as Record<string, unknown> | null;
  const rep = raw.repair_evidence as Record<string, unknown> | null;
  const ver = raw.verification_result as Record<string, unknown> | null;

  return {
    incidentId: String(raw.incident_id),
    dmaId: String(raw.dma_id),
    pipeSegmentId: raw.pipe_segment_id ? String(raw.pipe_segment_id) : undefined,
    title: String(raw.title),
    detectedAt: new Date(String(raw.detected_at)),
    state: String(raw.state) as IncidentState,
    severity: String(raw.severity) as IncidentSeverity,
    estimatedLossM3h: Number(raw.estimated_loss_m3h),
    version: Number(raw.version),
    closedAt: raw.closed_at ? new Date(String(raw.closed_at)) : undefined,
    closedBy: raw.closed_by ? String(raw.closed_by) : undefined,
    falseAlarmReason: raw.false_alarm_reason ? String(raw.false_alarm_reason) : undefined,
    crewAssignment: crew
      ? {
          crewId: String(crew.crew_id),
          crewName: String(crew.crew_name),
          crewPhone: String(crew.crew_phone),
          role: String(crew.role),
          etaMinutes: Number(crew.eta_minutes),
          assignedAt: new Date(String(crew.assigned_at)),
          assignedBy: crew.assigned_by ? String(crew.assigned_by) : undefined,
        }
      : undefined,
    repairEvidence: rep
      ? {
          technicianId: String(rep.technician_id),
          repairMethod: String(rep.repair_method),
          clampType: rep.clamp_type ? String(rep.clamp_type) : undefined,
          acousticFreqHz: rep.acoustic_freq_hz !== null && rep.acoustic_freq_hz !== undefined ? Number(rep.acoustic_freq_hz) : undefined,
          photoFixtureRef: String(rep.photo_fixture_ref),
          completedAt: new Date(String(rep.completed_at)),
          technicianNotes: String(rep.technician_notes ?? ''),
          recordedBy: rep.recorded_by ? String(rep.recorded_by) : undefined,
        }
      : undefined,
    verificationResult: ver
      ? {
          evaluatedAt: new Date(String(ver.evaluated_at)),
          evaluatedBy: ver.evaluated_by ? String(ver.evaluated_by) : undefined,
          outcome: String(ver.outcome) as VerificationOutcome,
          preRepairMnfM3h: Number(ver.pre_repair_mnf_m3h),
          postRepairMnfM3h: Number(ver.post_repair_mnf_m3h),
          pressureNormalizedPreMnfM3h: Number(ver.pressure_normalized_pre_mnf_m3h),
          baselineMnfM3h: Number(ver.baseline_mnf_m3h),
          verifiedLossDropM3h: Number(ver.verified_loss_drop_m3h),
          isSuccessful: Boolean(ver.is_successful),
          policyLabel: String(ver.policy_label ?? ''),
          assumptions: Array.isArray(ver.assumptions) ? ver.assumptions.map(String) : [],
          reason: String(ver.reason ?? ''),
        }
      : undefined,
  };
}

function deserializeAudit(raw: Record<string, unknown>): AuditEvent {
  return {
    id: String(raw.audit_id),
    timestamp: new Date(String(raw.timestamp)),
    eventType: String(raw.event_type),
    sourceComponent: String(raw.source_component),
    severity: String(raw.severity) as AuditEvent['severity'],
    actorId: raw.actor_id ? String(raw.actor_id) : undefined,
    actorRole: raw.actor_role ? String(raw.actor_role) : undefined,
    correlationId: raw.correlation_id ? String(raw.correlation_id) : undefined,
    dmaId: raw.dma_id ? String(raw.dma_id) : undefined,
    incidentId: raw.incident_id ? String(raw.incident_id) : undefined,
    message: String(raw.message),
    metadata: (raw.metadata as Record<string, unknown>) ?? undefined,
  };
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, options);
    const correlationId = res.headers.get('X-Correlation-Id') ?? undefined;
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        errorCode: String(body.error_code ?? (res.status === 503 ? 'DATABASE_UNAVAILABLE' : 'HTTP_ERROR')),
        message: String(body.message ?? `HTTP ${res.status} request failed`),
        currentVersion: body.current_version !== undefined ? (body.current_version as number | null) : undefined,
        correlationId: (body.correlation_id as string | undefined) ?? correlationId,
        unavailable: res.status === 503,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: body as T,
      correlationId,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      errorCode: 'BACKEND_UNREACHABLE',
      message: err instanceof Error ? err.message : 'Unable to reach SAMT HTTP API',
      unavailable: true,
    };
  }
}

export const samtApi = {
  async checkReady(): Promise<ApiResult<ReadyResponse>> {
    return requestJson<ReadyResponse>(`${getRootBaseUrl()}/ready`);
  },

  async listIncidents(persona: AuthPersona, dmaId?: string): Promise<ApiResult<Incident[]>> {
    const qs = dmaId ? `?dma_id=${encodeURIComponent(dmaId)}` : '';
    const res = await requestJson<{ incidents: Record<string, unknown>[] }>(
      `${getApiBaseUrl()}/incidents${qs}`,
      {
        headers: { Authorization: `Bearer ${DEFAULT_TOKENS[persona]}` },
      }
    );
    if (!res.ok) return res;
    return {
      ...res,
      data: (res.data.incidents ?? []).map(deserializeIncident),
    };
  },

  async getIncidentDetail(
    persona: AuthPersona,
    incidentId: string
  ): Promise<ApiResult<{ incident: Incident; auditEvents: AuditEvent[] }>> {
    const res = await requestJson<{
      incident: Record<string, unknown>;
      audit_events: Record<string, unknown>[];
    }>(`${getApiBaseUrl()}/incidents/${encodeURIComponent(incidentId)}`, {
      headers: { Authorization: `Bearer ${DEFAULT_TOKENS[persona]}` },
    });
    if (!res.ok) return res;
    return {
      ...res,
      data: {
        incident: deserializeIncident(res.data.incident),
        auditEvents: (res.data.audit_events ?? []).map(deserializeAudit),
      },
    };
  },

  async listAuditEvents(
    persona: AuthPersona,
    filter?: { dmaId?: string; incidentId?: string; limit?: number }
  ): Promise<ApiResult<AuditEvent[]>> {
    const params = new URLSearchParams();
    if (filter?.dmaId) params.set('dma_id', filter.dmaId);
    if (filter?.incidentId) params.set('incident_id', filter.incidentId);
    if (filter?.limit) params.set('limit', String(filter.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await requestJson<{ audit_events: Record<string, unknown>[] }>(
      `${getApiBaseUrl()}/audit${qs}`,
      {
        headers: { Authorization: `Bearer ${DEFAULT_TOKENS[persona]}` },
      }
    );
    if (!res.ok) return res;
    return {
      ...res,
      data: (res.data.audit_events ?? []).map(deserializeAudit),
    };
  },

  async getBalance(
    persona: AuthPersona,
    dmaId: string,
    windowStart: Date,
    windowEnd: Date
  ): Promise<ApiResult<ApiBalanceResponse>> {
    const params = new URLSearchParams({
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
    });
    return requestJson<ApiBalanceResponse>(
      `${getApiBaseUrl()}/dma/${encodeURIComponent(dmaId)}/balance?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${DEFAULT_TOKENS[persona]}` },
      }
    );
  },

  async getNightFlow(
    persona: AuthPersona,
    dmaId: string,
    dateAzt: string
  ): Promise<ApiResult<ApiNightFlowResponse>> {
    return requestJson<ApiNightFlowResponse>(
      `${getApiBaseUrl()}/dma/${encodeURIComponent(dmaId)}/night-flow?date=${encodeURIComponent(dateAzt)}`,
      {
        headers: { Authorization: `Bearer ${DEFAULT_TOKENS[persona]}` },
      }
    );
  },

  async ingestTelemetryBatch(
    deviceToken: string,
    payload: {
      gateway_id: string;
      batch_timestamp: string;
      is_historical_replay?: boolean;
      measurements: {
        observation_id: string;
        device_id?: string;
        meter_id: string;
        dma_id: string;
        metric: 'FLOW_M3H' | 'PRESSURE_BAR' | 'LEVEL_METERS';
        unit?: 'm3/h' | 'bar' | 'm';
        value: number;
        observed_at: string;
        battery_volts?: number;
      }[];
    }
  ): Promise<ApiResult<ApiBatchIngestResponse>> {
    return requestJson<ApiBatchIngestResponse>(`${getApiBaseUrl()}/telemetry/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Token': deviceToken,
      },
      body: JSON.stringify(payload),
    });
  },

  async assessDma(
    persona: AuthPersona,
    dmaId: string,
    dateAzt: string
  ): Promise<
    ApiResult<{
      incidentCreated: boolean;
      reason: string;
      incident: Incident | null;
    }>
  > {
    const res = await requestJson<{
      incident_created: boolean;
      reason: string;
      incident: Record<string, unknown> | null;
    }>(`${getApiBaseUrl()}/dma/${encodeURIComponent(dmaId)}/assess`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEFAULT_TOKENS[persona]}`,
      },
      body: JSON.stringify({ date: dateAzt }),
    });
    if (!res.ok) return res;
    return {
      ...res,
      data: {
        incidentCreated: res.data.incident_created,
        reason: res.data.reason,
        incident: res.data.incident ? deserializeIncident(res.data.incident) : null,
      },
    };
  },

  async transitionIncident(
    persona: AuthPersona,
    incidentId: string,
    expectedVersion: number,
    commandId: string,
    event: IncidentEvent,
    persistedVerificationDates?: { preRepairDate: string; postRepairDate: string }
  ): Promise<
    ApiResult<{
      incident: Incident;
      transitionDescription: string;
      idempotentReplay: boolean;
    }>
  > {
    let body: Record<string, unknown>;
    switch (event.type) {
      case 'ASSIGN':
        body = {
          event_type: 'ASSIGN',
          expected_version: expectedVersion,
          command_id: commandId,
          payload: {
            crew_id: event.crew.crewId,
            crew_name: event.crew.crewName,
            crew_phone: event.crew.crewPhone,
            role: event.crew.role,
            eta_minutes: event.crew.etaMinutes,
          },
        };
        break;
      case 'MARK_FALSE_ALARM':
        body = {
          event_type: 'MARK_FALSE_ALARM',
          expected_version: expectedVersion,
          command_id: commandId,
          payload: { reason: event.reason },
        };
        break;
      case 'START_REPAIR':
        body = {
          event_type: 'START_REPAIR',
          expected_version: expectedVersion,
          command_id: commandId,
          payload: {
            technician_id: event.technicianId,
            check_in_gps: event.checkInGps,
          },
        };
        break;
      case 'RECORD_REPAIR_EVIDENCE':
        body = {
          event_type: 'RECORD_REPAIR_EVIDENCE',
          expected_version: expectedVersion,
          command_id: commandId,
          payload: {
            technician_id: event.evidence.technicianId,
            repair_method: event.evidence.repairMethod,
            clamp_type: event.evidence.clampType,
            acoustic_freq_hz: event.evidence.acousticFreqHz,
            photo_fixture_ref: event.evidence.photoFixtureRef,
            technician_notes: event.evidence.technicianNotes,
          },
        };
        break;
      case 'EVALUATE_VERIFICATION':
        body = {
          event_type: 'EVALUATE_VERIFICATION',
          expected_version: expectedVersion,
          command_id: commandId,
          payload: persistedVerificationDates
            ? {
                pre_repair_date: persistedVerificationDates.preRepairDate,
                post_repair_date: persistedVerificationDates.postRepairDate,
                leakage_exponent: event.evidence.leakageExponent ?? 0.5,
              }
            : {
                baseline_mnf_m3h: event.evidence.baselineMnfM3h,
                leakage_exponent: event.evidence.leakageExponent ?? 0.5,
                pre_repair_window: {
                  window_start: event.evidence.preRepairWindow.windowStart.toISOString(),
                  window_end: event.evidence.preRepairWindow.windowEnd.toISOString(),
                  sample_count: event.evidence.preRepairWindow.sampleCount,
                  coverage_ratio: event.evidence.preRepairWindow.coverageRatio,
                  mnf_m3h: event.evidence.preRepairWindow.mnfM3h,
                  avg_pressure_bar: event.evidence.preRepairWindow.avgPressureBar,
                  authorized_allowance_m3h: event.evidence.preRepairWindow.authorizedAllowanceM3h,
                  provenance: event.evidence.preRepairWindow.provenance,
                },
                post_repair_window: {
                  window_start: event.evidence.postRepairWindow.windowStart.toISOString(),
                  window_end: event.evidence.postRepairWindow.windowEnd.toISOString(),
                  sample_count: event.evidence.postRepairWindow.sampleCount,
                  coverage_ratio: event.evidence.postRepairWindow.coverageRatio,
                  mnf_m3h: event.evidence.postRepairWindow.mnfM3h,
                  avg_pressure_bar: event.evidence.postRepairWindow.avgPressureBar,
                  authorized_allowance_m3h: event.evidence.postRepairWindow.authorizedAllowanceM3h,
                  provenance: event.evidence.postRepairWindow.provenance,
                },
              },
        };
        break;
      case 'CLOSE':
        body = {
          event_type: 'CLOSE',
          expected_version: expectedVersion,
          command_id: commandId,
          payload: { notes: event.notes },
        };
        break;
    }

    const res = await requestJson<{
      incident: Record<string, unknown>;
      transition_description: string;
      idempotent_replay: boolean;
    }>(`${getApiBaseUrl()}/incidents/${encodeURIComponent(incidentId)}/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEFAULT_TOKENS[persona]}`,
        'Idempotency-Key': commandId,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return res;
    return {
      ...res,
      data: {
        incident: deserializeIncident(res.data.incident),
        transitionDescription: res.data.transition_description,
        idempotentReplay: Boolean(res.data.idempotent_replay),
      },
    };
  },

  async solveAllocation(
    persona: AuthPersona,
    consumers: ConsumerRequest[],
    availableWaterM3: number
  ): Promise<ApiResult<AllocationPlanResult>> {
    const res = await requestJson<Record<string, unknown>>(`${getApiBaseUrl()}/allocation/solve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEFAULT_TOKENS[persona]}`,
      },
      body: JSON.stringify({
        region_id: 'REG-KUR-ARAS-03',
        canal_network_id: 'CANAL-NET-SHIRVAN-01',
        available_water_m3: availableWaterM3,
        volume_unit: 'THOUSAND_M3',
        delivery_horizon_hours: 24,
        consumers: consumers.map((c) => ({
          id: c.id,
          name: c.name,
          region: c.region,
          demand_m3: c.demandM3,
          priority_weight: c.weight,
          canal_capacity_m3: c.canalCapacityM3,
          minimum_survival_m3: c.minimumSurvivalM3,
        })),
      }),
    });
    if (!res.ok) return res;
    const d = res.data;
    const rawAllocs = (d.allocations as Record<string, unknown>[]) ?? [];
    return {
      ...res,
      data: {
        status: String(d.status) as AllocationPlanResult['status'],
        volumeUnit: String(d.volume_unit) as AllocationPlanResult['volumeUnit'],
        deliveryHorizonHours: Number(d.delivery_horizon_hours),
        totalSupplyM3: Number(d.total_supply_m3),
        totalAllocatedM3: Number(d.total_allocated_m3),
        totalDemandM3: Number(d.total_demand_m3),
        unmetDemandM3: Number(d.unmet_demand_m3),
        residualSupplyM3: Number(d.residual_supply_m3),
        giniIndex: d.gini_index !== null ? Number(d.gini_index) : null,
        giniNote: String(d.gini_note ?? ''),
        policyDescription: String(d.policy_description ?? ''),
        solveDurationMs: Number(d.solve_duration_ms ?? 0),
        satisfactionDistribution: rawAllocs.map((a) =>
          a.satisfaction_pct !== null ? Number(a.satisfaction_pct) : null
        ),
        allocations: rawAllocs.map((a) => ({
          id: String(a.consumer_id),
          name: String(a.name),
          region: String(a.region ?? ''),
          demandM3: Number(a.demand_m3),
          canalCapacityM3: Number(a.canal_capacity_m3),
          weight: Number(a.weight),
          allocatedM3: Number(a.allocated_m3),
          unmetM3: Number(a.unmet_m3),
          satisfactionPct: a.satisfaction_pct !== null ? Number(a.satisfaction_pct) : null,
          reasonCode: String(a.reason_code),
        })),
      },
    };
  },
};
