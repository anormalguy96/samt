/**
 * Domain Composition Root & State Context (Lecture 4: Dependency Inversion & DIP)
 * SAMT v1.1.0:
 * - Supports explicit RuntimeMode:
 *   1. INTEGRATED_API: Connects to real local Node/TypeScript HTTP API + PostgreSQL 16.
 *      Never silently falls back to static demo data when API/DB is unavailable.
 *   2. STATIC_DEMO: Browser-only isolated sandbox with FixedClock, fault injection,
 *      and isolated InMemory / ValidatedJsonFixture adapters (switching does NOT migrate data).
 * - Scopes incidents strictly to selectedDmaId (no cross-DMA fallback to incidents[0]).
 * - Routes transitions through shared ExecuteIncidentTransitionUseCase with expectedVersion
 *   and collision-resistant commandId, surfacing HTTP 409 conflicts and 403 role blocks cleanly.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { FixedClock } from '../domain/ports/Clock';
import { InMemoryIncidentRepository } from '../domain/adapters/InMemoryIncidentRepository';
import {
  ValidatedJsonFixtureIncidentRepository,
  INITIAL_FIXTURE_INCIDENTS,
} from '../domain/adapters/ValidatedJsonFixtureIncidentRepository';
import { RecordingAuditSink } from '../domain/adapters/RecordingAuditSink';
import { StandardMeterRegistry } from '../domain/adapters/StandardMeterRegistry';
import { TelemetryValidator } from '../domain/telemetry/validation';
import {
  allocateConstrainedWater,
  type ConsumerRequest,
  type AllocationPlanResult,
} from '../domain/allocation/constrainedAllocation';
import {
  estimateIllustrativeSavings,
  type SavingsResult,
} from '../domain/savings/illustrativeSavings';
import { ExecuteIncidentTransitionUseCase } from '../application/ExecuteIncidentTransitionUseCase';
import { generateId } from '../application/hashUtils';
import { getLocalDateKey } from '../domain/nightflow/nightWindowFilter';
import type { Incident, IncidentEvent, IIncidentRepository } from '../domain/ports/IncidentPort';
import type { AuditEvent } from '../domain/ports/AuditPort';
import {
  samtApi,
  getDeviceConfigForDma,
  type AuthPersona,
  type ApiBalanceResponse,
  type ApiNightFlowResponse,
  type ApiBatchIngestResponse,
} from '../services/apiClient';

export type DbAdapterMode = 'IN_MEMORY' | 'VALIDATED_FIXTURE';
export type RuntimeMode = 'INTEGRATED_API' | 'STATIC_DEMO';
export type ApiRuntimeStatus = 'IDLE' | 'LOADING' | 'READY' | 'UNAVAILABLE' | 'ERROR';

export interface StaleConflictInfo {
  incidentId: string;
  expectedVersion: number;
  currentVersion?: number | null;
  message: string;
}

export interface DispatchOutcome {
  success: boolean;
  error?: string;
  errorCode?: string;
  status?: number;
  currentVersion?: number | null;
  idempotentReplay?: boolean;
}

export interface DomainContextType {
  // Runtime Mode & Auth Persona
  runtimeMode: RuntimeMode;
  setRuntimeMode: (mode: RuntimeMode) => void;
  persona: AuthPersona;
  setPersona: (persona: AuthPersona) => void;
  apiStatus: ApiRuntimeStatus;
  apiError: string | null;
  staleConflict: StaleConflictInfo | null;
  clearStaleConflict: () => void;
  refreshBackend: () => Promise<void>;

  // Persisted API hydraulic snapshots
  persistedBalance: ApiBalanceResponse | null;
  persistedNightFlow: ApiNightFlowResponse | null;
  lastIngestResult: ApiBatchIngestResponse | null;
  assessmentDateAzt: string;
  setAssessmentDateAzt: (date: string) => void;
  ingestSyntheticDmaBatch: (
    scenario: 'LIVE_ANOMALY' | 'POST_REPAIR_HEALTHY' | 'HISTORICAL_REPLAY' | 'CORRUPTED'
  ) => Promise<{ ok: boolean; message: string; summary?: ApiBatchIngestResponse }>;
  assessSelectedDma: () => Promise<{ ok: boolean; message: string; incident?: Incident | null }>;

  // Demo Clock seam (explicitly demo/test mode only)
  clock: FixedClock;
  clockTick: number;
  simulatedHour: number;
  isNocturnal: boolean;
  jumpToNight: () => void;
  resetRealtime: () => void;
  setSimulatedHour: (hour: number) => void;

  // Selected DMA
  selectedDmaId: string;
  setSelectedDmaId: (id: string) => void;

  // Hexagonal Adapters (Demo Mode isolated stores)
  activeDbAdapter: DbAdapterMode;
  setActiveDbAdapter: (mode: DbAdapterMode) => void;

  // Incident state machine & repository
  incidents: Incident[];
  dmaIncidents: Incident[];
  activeIncident: Incident | undefined; // Strictly scoped to selectedDmaId (undefined if empty!)
  selectedIncident: Incident | null;
  setSelectedIncident: (inc: Incident | null) => void;
  dispatchIncidentEvent: (
    incidentId: string,
    event: IncidentEvent,
    options?: {
      expectedVersion?: number;
      commandId?: string;
      persistedVerificationDates?: { preRepairDate: string; postRepairDate: string };
    }
  ) => Promise<DispatchOutcome>;
  createNewIncident: (dmaId: string, lossM3h: number, title?: string) => Promise<Incident | null>;

  // Audit logs (persisted from DB in Integrated Mode, RecordingAuditSink in Demo Mode)
  auditLogs: AuditEvent[];

  // Fault injection into demo pipeline
  hasBurstAnomaly: boolean;
  hasTankRefill: boolean;
  hasCorruptedPacket: boolean;
  lastCorruptedValidationMessage: string | null;
  toggleBurstAnomaly: (val: boolean) => void;
  toggleTankRefill: (val: boolean) => void;
  toggleCorruptedPacket: (val: boolean) => void;

  // Constrained Allocation
  consumers: ConsumerRequest[];
  availableSupplyM3: number;
  setAvailableSupplyM3: (val: number) => void;
  allocationResult: AllocationPlanResult;
  allocationError: string | null;
  runAllocation: () => Promise<void>;
  isSolvingAllocation: boolean;

  // Illustrative Savings
  baselineFlowM3h: number;
  baselinePressureBar: number;
  postRepairFlowM3h: number;
  postRepairPressureBar: number;
  leakageExponent: number;
  illustrativeTariffAznM3: number;
  savingsResult: SavingsResult;
  setBaselineFlowM3h: (val: number) => void;
  setBaselinePressureBar: (val: number) => void;
  setPostRepairFlowM3h: (val: number) => void;
  setPostRepairPressureBar: (val: number) => void;
  setLeakageExponent: (val: number) => void;
  setIllustrativeTariffAznM3: (val: number) => void;
}

const DomainContext = createContext<DomainContextType | null>(null);

const INITIAL_CONSUMERS: ConsumerRequest[] = [
  {
    id: 'cons-1',
    name: 'Gəncə-Qazax Su İstifadəçiləri Birliyi',
    region: 'Şəmkirçay Kanalı',
    demandM3: 140,
    weight: 0.9,
    canalCapacityM3: 150,
  },
  {
    id: 'cons-2',
    name: 'Mərkəzi Aran Pambıqçılıq & Taxılçılıq',
    region: 'Yuxarı Şirvan Kanalı',
    demandM3: 210,
    weight: 0.85,
    canalCapacityM3: 220,
  },
  {
    id: 'cons-3',
    name: 'Abşeron Zeytun & Badam Bağları Aqroparkı',
    region: 'Samur-Abşeron Kanalı',
    demandM3: 85,
    weight: 0.75,
    canalCapacityM3: 100,
  },
  {
    id: 'cons-4',
    name: 'Qarabağ Regional Suvarma Şəbəkəsi',
    region: 'Tərtərçay Baş Kanalı',
    demandM3: 160,
    weight: 0.95,
    canalCapacityM3: 180,
  },
  {
    id: 'cons-5',
    name: 'Cənub Muğan Tərəvəzçilik Kooperativi',
    region: 'Baş Mil Kanalı',
    demandM3: 110,
    weight: 0.7,
    canalCapacityM3: 120,
  },
];

function detectInitialRuntimeMode(): RuntimeMode {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'STATIC_DEMO';
  }
  return 'INTEGRATED_API';
}

export const DomainProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [runtimeMode, setRuntimeModeState] = useState<RuntimeMode>(detectInitialRuntimeMode);
  const [persona, setPersona] = useState<AuthPersona>('dispatcher');
  const [apiStatus, setApiStatus] = useState<ApiRuntimeStatus>('IDLE');
  const [apiError, setApiError] = useState<string | null>(null);
  const [staleConflict, setStaleConflict] = useState<StaleConflictInfo | null>(null);

  // Demo Clock seam (browser-only sandbox; never alters server time)
  const clock = useMemo(() => new FixedClock('2026-10-20T14:00:00+04:00'), []);
  const [clockTick, setClockTick] = useState<number>(0);
  const [simulatedHour, setSimulatedHourState] = useState<number>(14);

  // Demo Audit Sink & Registry
  const auditSink = useMemo(() => new RecordingAuditSink(clock), [clock]);
  const demoRegistry = useMemo(() => new StandardMeterRegistry(), []);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);

  // Selected DMA & Assessment Date
  const [selectedDmaId, setSelectedDmaId] = useState<string>('DMA-YASAMAL-04');
  const [assessmentDateAzt, setAssessmentDateAzt] = useState<string>(() =>
    getLocalDateKey(new Date())
  );

  // Isolated Demo Repositories (switching selects isolated store; does NOT migrate data)
  const inMemoryRepo = useMemo(() => new InMemoryIncidentRepository(INITIAL_FIXTURE_INCIDENTS), []);
  const fixtureRepo = useMemo(
    () => new ValidatedJsonFixtureIncidentRepository(INITIAL_FIXTURE_INCIDENTS),
    []
  );
  const [activeDbAdapter, setActiveDbAdapter] = useState<DbAdapterMode>('IN_MEMORY');
  const currentDemoRepo: IIncidentRepository =
    activeDbAdapter === 'IN_MEMORY' ? inMemoryRepo : fixtureRepo;

  // Incident & Hydraulic state
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [persistedBalance, setPersistedBalance] = useState<ApiBalanceResponse | null>(null);
  const [persistedNightFlow, setPersistedNightFlow] = useState<ApiNightFlowResponse | null>(null);
  const [lastIngestResult, setLastIngestResult] = useState<ApiBatchIngestResponse | null>(null);

  // Demo Fault Toggles
  const [hasBurstAnomaly, setHasBurstAnomaly] = useState<boolean>(true);
  const [hasTankRefill, setHasTankRefill] = useState<boolean>(true);
  const [hasCorruptedPacket, setHasCorruptedPacket] = useState<boolean>(false);
  const [lastCorruptedValidationMessage, setLastCorruptedValidationMessage] = useState<string | null>(
    null
  );

  // Allocation State
  const [consumers] = useState<ConsumerRequest[]>(INITIAL_CONSUMERS);
  const [availableSupplyM3, setAvailableSupplyM3] = useState<number>(610);
  const [isSolvingAllocation, setIsSolvingAllocation] = useState<boolean>(false);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [allocationResult, setAllocationResult] = useState<AllocationPlanResult>(() =>
    allocateConstrainedWater(INITIAL_CONSUMERS, 610, {
      volumeUnit: 'THOUSAND_M3',
      deliveryHorizonHours: 24,
    })
  );

  // Illustrative Savings State
  const [baselineFlowM3h, setBaselineFlowM3h] = useState<number>(104.2);
  const [baselinePressureBar, setBaselinePressureBar] = useState<number>(4.2);
  const [postRepairFlowM3h, setPostRepairFlowM3h] = useState<number>(76.5);
  const [postRepairPressureBar, setPostRepairPressureBar] = useState<number>(4.0);
  const [leakageExponent, setLeakageExponent] = useState<number>(0.5);
  const [illustrativeTariffAznM3, setIllustrativeTariffAznM3] = useState<number>(0.4);

  const savingsResult = useMemo(() => {
    return estimateIllustrativeSavings({
      baselineFlowM3h,
      baselinePressureBar,
      postRepairFlowM3h,
      postRepairPressureBar,
      leakageExponent,
      illustrativeTariffAznM3,
    });
  }, [
    baselineFlowM3h,
    baselinePressureBar,
    postRepairFlowM3h,
    postRepairPressureBar,
    leakageExponent,
    illustrativeTariffAznM3,
  ]);

  const setRuntimeMode = useCallback((mode: RuntimeMode) => {
    setRuntimeModeState(mode);
    setStaleConflict(null);
    setApiError(null);
    setSelectedIncident(null);
    if (mode === 'STATIC_DEMO') {
      setPersistedBalance(null);
      setPersistedNightFlow(null);
      setApiStatus('IDLE');
    }
  }, []);

  const refreshDemoState = useCallback(async () => {
    const list = await currentDemoRepo.getAll();
    setIncidents(list);
    setAuditLogs(auditSink.getEvents().slice(-30).reverse());
  }, [currentDemoRepo, auditSink]);

  const refreshBackend = useCallback(async () => {
    if (runtimeMode !== 'INTEGRATED_API') {
      await refreshDemoState();
      return;
    }

    setApiStatus('LOADING');
    setApiError(null);

    const readyRes = await samtApi.checkReady();
    if (!readyRes.ok || readyRes.data.database !== 'UP') {
      // NEVER silently fall back to demo data!
      setApiStatus('UNAVAILABLE');
      setApiError(
        readyRes.ok
          ? 'PostgreSQL readiness check reported DOWN'
          : `${readyRes.errorCode}: ${readyRes.message}`
      );
      setIncidents([]);
      setAuditLogs([]);
      setPersistedBalance(null);
      setPersistedNightFlow(null);
      return;
    }

    const now = new Date();
    const windowEnd = now;
    const windowStart = new Date(now.getTime() - 15 * 60 * 1000);

    const [incRes, audRes, balRes, mnfRes] = await Promise.all([
      samtApi.listIncidents(persona),
      samtApi.listAuditEvents(persona, { dmaId: selectedDmaId, limit: 40 }),
      samtApi.getBalance(persona, selectedDmaId, windowStart, windowEnd),
      samtApi.getNightFlow(persona, selectedDmaId, assessmentDateAzt),
    ]);

    if (!incRes.ok) {
      setApiStatus(incRes.unavailable ? 'UNAVAILABLE' : 'ERROR');
      setApiError(`${incRes.errorCode}: ${incRes.message}`);
      return;
    }

    setApiStatus('READY');
    setIncidents(incRes.data);
    if (audRes.ok) setAuditLogs(audRes.data);
    if (balRes.ok) setPersistedBalance(balRes.data);
    else setPersistedBalance(null);
    if (mnfRes.ok) setPersistedNightFlow(mnfRes.data);
    else setPersistedNightFlow(null);

    // Keep open modal synchronized if incident still exists
    setSelectedIncident((prev) =>
      prev ? incRes.data.find((i) => i.incidentId === prev.incidentId) ?? null : null
    );
  }, [runtimeMode, persona, selectedDmaId, assessmentDateAzt, refreshDemoState]);

  useEffect(() => {
    refreshBackend();
  }, [runtimeMode, activeDbAdapter, persona, selectedDmaId, assessmentDateAzt, refreshBackend]);

  // Demo Clock controls
  const isNocturnal = simulatedHour >= 2 && simulatedHour < 4;

  const setSimulatedHour = useCallback(
    (hour: number) => {
      setSimulatedHourState(hour);
      const dateStr = `2026-10-20T${String(hour).padStart(2, '0')}:00:00+04:00`;
      clock.setTime(dateStr);
      setClockTick((t) => t + 1);
      auditSink.record({
        id: generateId('clk'),
        timestamp: clock.now(),
        eventType: 'CLOCK_SEAM_ADJUSTED',
        sourceComponent: 'TestabilityHarness',
        severity: 'INFO',
        message: `Demo FixedClock adjusted to ${String(hour).padStart(2, '0')}:00 AZT`,
      });
      if (runtimeMode === 'STATIC_DEMO') {
        setAuditLogs(auditSink.getEvents().slice(-30).reverse());
      }
    },
    [clock, auditSink, runtimeMode]
  );

  const jumpToNight = useCallback(() => setSimulatedHour(3), [setSimulatedHour]);
  const resetRealtime = useCallback(() => {
    const now = new Date();
    const bakuHour = (now.getUTCHours() + 4) % 24;
    setSimulatedHourState(bakuHour);
    clock.setTime(now);
    setClockTick((t) => t + 1);
    auditSink.record({
      id: generateId('clk'),
      timestamp: clock.now(),
      eventType: 'CLOCK_SEAM_RESET',
      sourceComponent: 'TestabilityHarness',
      severity: 'INFO',
      message: `Demo FixedClock synchronized to wall-clock time (${now.toISOString()})`,
    });
    if (runtimeMode === 'STATIC_DEMO') {
      setAuditLogs(auditSink.getEvents().slice(-30).reverse());
    }
  }, [clock, auditSink, runtimeMode]);

  // Synthetic telemetry batch submission through real API or domain validator
  const ingestSyntheticDmaBatch = useCallback(
    async (
      scenario: 'LIVE_ANOMALY' | 'POST_REPAIR_HEALTHY' | 'HISTORICAL_REPLAY' | 'CORRUPTED'
    ) => {
      const devCfg = getDeviceConfigForDma(selectedDmaId);
      if (!devCfg) {
        return {
          ok: false,
          message: `No bound local dev device token configured for ${selectedDmaId} (configured for DMA-YASAMAL-04 and DMA-NASIMI-02)`,
        };
      }

      const now = new Date();
      const runTag = generateId('sim').slice(-8);

      // Build measurements matching the chosen scenario
      const measurements: {
        observation_id: string;
        device_id?: string;
        meter_id: string;
        dma_id: string;
        metric: 'FLOW_M3H' | 'PRESSURE_BAR' | 'LEVEL_METERS';
        unit?: 'm3/h' | 'bar' | 'm';
        value: number;
        observed_at: string;
        battery_volts?: number;
      }[] = [];

      if (scenario === 'CORRUPTED') {
        measurements.push({
          observation_id: `obs-corrupt-${runTag}`,
          device_id: devCfg.deviceId,
          meter_id: devCfg.inletMeterId,
          dma_id: selectedDmaId,
          metric: 'FLOW_M3H',
          unit: 'm3/h',
          value: -42.5, // Physically impossible negative flow -> rejected by DbC validator
          observed_at: now.toISOString(),
          battery_volts: 2.4,
        });
      } else if (scenario === 'HISTORICAL_REPLAY') {
        const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000);
        for (let i = 0; i < 4; i++) {
          measurements.push({
            observation_id: `obs-hist-${runTag}-${i}`,
            device_id: devCfg.deviceId,
            meter_id: devCfg.inletMeterId,
            dma_id: selectedDmaId,
            metric: 'FLOW_M3H',
            unit: 'm3/h',
            value: 72.0,
            observed_at: new Date(twoHoursAgo.getTime() + i * 15 * 1000).toISOString(),
            battery_volts: 3.5,
          });
        }
      } else {
        // LIVE_ANOMALY or POST_REPAIR_HEALTHY: submit 10 readings in last 10 minutes + pressure
        const flowVal = scenario === 'LIVE_ANOMALY' ? 68.5 : 26.0;
        const outletVal = 18.0;
        for (let i = 0; i < 10; i++) {
          const ts = new Date(now.getTime() - (9 - i) * 60 * 1000).toISOString();
          measurements.push({
            observation_id: `obs-in-${runTag}-${i}`,
            device_id: devCfg.deviceId,
            meter_id: devCfg.inletMeterId,
            dma_id: selectedDmaId,
            metric: 'FLOW_M3H',
            unit: 'm3/h',
            value: flowVal,
            observed_at: ts,
            battery_volts: 3.6,
          });
          measurements.push({
            observation_id: `obs-out-${runTag}-${i}`,
            device_id: devCfg.deviceId,
            meter_id: devCfg.outletMeterId,
            dma_id: selectedDmaId,
            metric: 'FLOW_M3H',
            unit: 'm3/h',
            value: outletVal,
            observed_at: ts,
            battery_volts: 3.6,
          });
        }
        measurements.push({
          observation_id: `obs-p-${runTag}`,
          device_id: devCfg.deviceId,
          meter_id: devCfg.pressureMeterId,
          dma_id: selectedDmaId,
          metric: 'PRESSURE_BAR',
          unit: 'bar',
          value: 4.0,
          observed_at: now.toISOString(),
          battery_volts: 3.6,
        });
      }

      if (runtimeMode === 'INTEGRATED_API') {
        const res = await samtApi.ingestTelemetryBatch(devCfg.token, {
          gateway_id: devCfg.deviceId,
          batch_timestamp: now.toISOString(),
          is_historical_replay: scenario === 'HISTORICAL_REPLAY',
          measurements,
        });

        if (!res.ok) {
          if (res.status === 422) {
            setApiError(null);
            await refreshBackend();
            return {
              ok: false,
              message: `Batch rejected/quarantined by server validator (HTTP 422): ${res.message}`,
            };
          }
          if (res.unavailable) setApiStatus('UNAVAILABLE');
          return { ok: false, message: `${res.errorCode}: ${res.message}` };
        }

        setLastIngestResult(res.data);
        await refreshBackend();
        return {
          ok: true,
          summary: res.data,
          message: `HTTP 200 ${res.data.status}: accepted=${res.data.accepted_count} (live=${res.data.live_count}, historical=${res.data.historical_count}), dup=${res.data.duplicate_count}, quarantined=${res.data.quarantined_count}, rejected=${res.data.rejected_count}`,
        };
      }

      // Static demo mode: run through real TelemetryValidator
      const validator = new TelemetryValidator(clock, demoRegistry, {
        clientAuthenticated: true,
        authenticatedDeviceId: devCfg.deviceId,
      });
      let accepted = 0;
      let rejected = 0;
      let firstReason = '';
      for (const m of measurements) {
        const r = validator.validate({
          observationId: m.observation_id,
          deviceId: devCfg.deviceId,
          meterId: m.meter_id,
          dmaId: m.dma_id,
          metric: m.metric,
          unit: m.unit,
          value: m.value,
          observedAt: new Date(m.observed_at),
          transmittedAt: clock.now(),
          batteryVolts: m.battery_volts,
        });
        if (r.accepted) accepted++;
        else {
          rejected++;
          if (!firstReason && r.reason) firstReason = r.reason;
        }
      }
      auditSink.record({
        id: generateId('aud'),
        timestamp: clock.now(),
        eventType: 'DEMO_TELEMETRY_VALIDATED',
        sourceComponent: 'TelemetryValidator',
        severity: rejected > 0 ? 'WARN' : 'INFO',
        dmaId: selectedDmaId,
        message: `Demo batch (${scenario}): accepted=${accepted}, rejected=${rejected}${firstReason ? ` — ${firstReason}` : ''}`,
      });
      setAuditLogs(auditSink.getEvents().slice(-30).reverse());
      return {
        ok: accepted > 0,
        message: `Demo validation: accepted=${accepted}, rejected=${rejected}${firstReason ? ` (${firstReason})` : ''}`,
      };
    },
    [selectedDmaId, runtimeMode, clock, demoRegistry, auditSink, refreshBackend]
  );

  const assessSelectedDma = useCallback(async () => {
    if (runtimeMode !== 'INTEGRATED_API') {
      return {
        ok: false,
        message: 'Switch to Integrated Mode (API + PostgreSQL) to run persisted DMA assessment.',
      };
    }
    const res = await samtApi.assessDma(persona, selectedDmaId, assessmentDateAzt);
    if (!res.ok) {
      if (res.unavailable) setApiStatus('UNAVAILABLE');
      return { ok: false, message: `${res.errorCode} (${res.status}): ${res.message}` };
    }
    await refreshBackend();
    return {
      ok: true,
      message: res.data.incidentCreated
        ? `Created incident ${res.data.incident?.incidentId}: ${res.data.reason}`
        : res.data.reason,
      incident: res.data.incident,
    };
  }, [runtimeMode, persona, selectedDmaId, assessmentDateAzt, refreshBackend]);

  // Incident state transitions (shared use case in demo mode; real /v1 HTTP endpoint in Integrated Mode)
  const dispatchIncidentEvent = useCallback(
    async (
      incidentId: string,
      event: IncidentEvent,
      options?: {
        expectedVersion?: number;
        commandId?: string;
        persistedVerificationDates?: { preRepairDate: string; postRepairDate: string };
      }
    ): Promise<DispatchOutcome> => {
      setStaleConflict(null);
      const localInc = incidents.find((i) => i.incidentId === incidentId);
      const expectedVersion = options?.expectedVersion ?? localInc?.version ?? 1;
      const commandId = options?.commandId ?? generateId('cmd');

      if (runtimeMode === 'INTEGRATED_API') {
        const res = await samtApi.transitionIncident(
          persona,
          incidentId,
          expectedVersion,
          commandId,
          event,
          options?.persistedVerificationDates
        );

        if (!res.ok) {
          if (res.unavailable) {
            setApiStatus('UNAVAILABLE');
            setApiError(`${res.errorCode}: ${res.message}`);
          }
          if (res.status === 409) {
            setStaleConflict({
              incidentId,
              expectedVersion,
              currentVersion: res.currentVersion,
              message: res.message,
            });
          }
          return {
            success: false,
            error: res.message,
            errorCode: res.errorCode,
            status: res.status,
            currentVersion: res.currentVersion,
          };
        }

        await refreshBackend();
        return {
          success: true,
          status: res.status,
          idempotentReplay: res.data.idempotentReplay,
        };
      }

      // Static Demo Mode: execute shared ExecuteIncidentTransitionUseCase
      const uc = new ExecuteIncidentTransitionUseCase(currentDemoRepo, clock);
      const outcome = await uc.execute({
        incidentId,
        commandId,
        expectedVersion,
        event,
        actor: {
          actorId: persona === 'viewer' ? 'demo-viewer' : 'demo-dispatcher',
          role: persona,
        },
      });

      if (!outcome.ok) {
        auditSink.record({
          id: generateId('aud'),
          timestamp: clock.now(),
          eventType: 'TRANSITION_REJECTED',
          sourceComponent: 'ExecuteIncidentTransitionUseCase',
          severity: 'WARN',
          incidentId,
          message: `${outcome.errorCode}: ${outcome.error}`,
        });
        if (outcome.statusCode === 409) {
          setStaleConflict({
            incidentId,
            expectedVersion,
            currentVersion: outcome.currentVersion,
            message: outcome.error,
          });
        }
        await refreshDemoState();
        return {
          success: false,
          error: outcome.error,
          errorCode: outcome.errorCode,
          status: outcome.statusCode,
          currentVersion: outcome.currentVersion,
        };
      }

      auditSink.record({
        id: generateId('aud'),
        timestamp: clock.now(),
        eventType: `INCIDENT_${event.type}`,
        sourceComponent: 'ExecuteIncidentTransitionUseCase',
        severity: outcome.incident.state === 'VERIFIED' || outcome.incident.state === 'CLOSED' ? 'SUCCESS' : 'INFO',
        incidentId,
        dmaId: outcome.incident.dmaId,
        message: outcome.transitionDescription,
      });

      await refreshDemoState();
      if (selectedIncident?.incidentId === incidentId) {
        setSelectedIncident(outcome.incident);
      }

      return {
        success: true,
        status: outcome.statusCode,
        idempotentReplay: outcome.idempotentReplay,
      };
    },
    [
      incidents,
      runtimeMode,
      persona,
      refreshBackend,
      currentDemoRepo,
      clock,
      auditSink,
      refreshDemoState,
      selectedIncident,
    ]
  );

  const createNewIncident = useCallback(
    async (dmaId: string, lossM3h: number, title?: string): Promise<Incident | null> => {
      if (runtimeMode === 'INTEGRATED_API') {
        const res = await assessSelectedDma();
        return res.incident ?? null;
      }

      const newInc: Incident = {
        incidentId: generateId('INC').slice(0, 16).toUpperCase(),
        dmaId,
        title: title || `${dmaId} Synthetic Hydraulic Leak Anomaly`,
        detectedAt: clock.now(),
        state: 'DETECTED',
        severity: lossM3h > 30 ? 'CRITICAL' : 'MEDIUM',
        estimatedLossM3h: parseFloat(lossM3h.toFixed(1)),
        version: 1,
      };
      await currentDemoRepo.save(newInc);
      auditSink.record({
        id: generateId('aud'),
        timestamp: clock.now(),
        eventType: 'NEW_INCIDENT_REGISTERED',
        sourceComponent: 'DemoIncidentCreator',
        severity: 'ERROR',
        dmaId,
        incidentId: newInc.incidentId,
        message: `New demo incident registered for ${dmaId}: +${lossM3h.toFixed(1)} m³/h`,
      });
      await refreshDemoState();
      return newInc;
    },
    [runtimeMode, assessSelectedDma, clock, currentDemoRepo, auditSink, refreshDemoState]
  );

  const runAllocation = useCallback(async () => {
    setIsSolvingAllocation(true);
    setAllocationError(null);

    if (runtimeMode === 'INTEGRATED_API') {
      const res = await samtApi.solveAllocation(persona, consumers, availableSupplyM3);
      setIsSolvingAllocation(false);
      if (!res.ok) {
        setAllocationError(`${res.errorCode}: ${res.message}`);
        if (res.unavailable) setApiStatus('UNAVAILABLE');
        return;
      }
      setAllocationResult(res.data);
      return;
    }

    try {
      const plan = allocateConstrainedWater(consumers, availableSupplyM3, {
        volumeUnit: 'THOUSAND_M3',
        deliveryHorizonHours: 24,
      });
      setAllocationResult(plan);
      auditSink.record({
        id: generateId('aud'),
        timestamp: clock.now(),
        eventType: 'ALLOCATION_COMPUTED',
        sourceComponent: 'ConstrainedAllocationEngine',
        severity: 'INFO',
        message: `Progressive-filling allocation computed for ${availableSupplyM3} thousand m³ / 24h (Gini: ${plan.giniIndex ?? 'N/A'})`,
      });
      setAuditLogs(auditSink.getEvents().slice(-30).reverse());
    } catch (err) {
      setAllocationError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSolvingAllocation(false);
    }
  }, [runtimeMode, persona, consumers, availableSupplyM3, clock, auditSink]);

  const toggleBurstAnomaly = useCallback(
    (val: boolean) => {
      setHasBurstAnomaly(val);
      auditSink.record({
        id: generateId('aud'),
        timestamp: clock.now(),
        eventType: 'FAULT_BURST_TOGGLED',
        sourceComponent: 'DemoSyntheticGenerator',
        severity: val ? 'WARN' : 'INFO',
        dmaId: selectedDmaId,
        message: val
          ? 'Enabled synthetic burst transient (+38.4 m³/h demo amplitude)'
          : 'Disabled synthetic burst anomaly',
      });
      if (runtimeMode === 'STATIC_DEMO') {
        setAuditLogs(auditSink.getEvents().slice(-30).reverse());
      }
    },
    [clock, auditSink, selectedDmaId, runtimeMode]
  );

  const toggleTankRefill = useCallback(
    (val: boolean) => {
      setHasTankRefill(val);
      auditSink.record({
        id: generateId('aud'),
        timestamp: clock.now(),
        eventType: 'FAULT_TANK_TOGGLED',
        sourceComponent: 'DemoSyntheticGenerator',
        severity: 'INFO',
        dmaId: selectedDmaId,
        message: val ? 'Enabled synthetic rooftop tank refill curve' : 'Disabled tank refill pattern',
      });
      if (runtimeMode === 'STATIC_DEMO') {
        setAuditLogs(auditSink.getEvents().slice(-30).reverse());
      }
    },
    [clock, auditSink, selectedDmaId, runtimeMode]
  );

  // Corrupted-packet toggle routes a real malformed/future-skew packet through TelemetryValidator!
  const toggleCorruptedPacket = useCallback(
    (val: boolean) => {
      setHasCorruptedPacket(val);
      if (val) {
        const validator = new TelemetryValidator(clock, demoRegistry, {
          clientAuthenticated: true,
          authenticatedDeviceId: 'GW-YAS-01',
        });
        const futureSkewResult = validator.validate({
          observationId: generateId('obs-bad'),
          deviceId: 'GW-YAS-01',
          meterId: 'FM-YAS-INLET-01',
          dmaId: 'DMA-YASAMAL-04',
          metric: 'FLOW_M3H',
          unit: 'm3/h',
          value: 105.0,
          observedAt: new Date(clock.now().getTime() + 45 * 60 * 1000), // +45 min future skew
          transmittedAt: clock.now(),
          batteryVolts: 3.4,
        });
        const msg = `${futureSkewResult.quality} (${futureSkewResult.code}): ${futureSkewResult.reason}`;
        setLastCorruptedValidationMessage(msg);
        auditSink.record({
          id: generateId('aud'),
          timestamp: clock.now(),
          eventType: 'TELEMETRY_QUARANTINED',
          sourceComponent: 'TelemetryValidator',
          severity: 'ERROR',
          dmaId: 'DMA-YASAMAL-04',
          message: `Injected invalid observation exercised real validator -> ${msg}`,
        });
      } else {
        setLastCorruptedValidationMessage(null);
        auditSink.record({
          id: generateId('aud'),
          timestamp: clock.now(),
          eventType: 'FAULT_CORRUPTION_CLEARED',
          sourceComponent: 'TelemetryValidator',
          severity: 'INFO',
          message: 'Cleared corrupted-packet test fault',
        });
      }
      if (runtimeMode === 'STATIC_DEMO') {
        setAuditLogs(auditSink.getEvents().slice(-30).reverse());
      }
    },
    [clock, demoRegistry, auditSink, runtimeMode]
  );

  // STRICT DMA SCOPING: never fall back to another DMA's incident!
  const dmaIncidents = useMemo(
    () => incidents.filter((i) => i.dmaId === selectedDmaId),
    [incidents, selectedDmaId]
  );

  const activeIncident = useMemo(() => {
    return dmaIncidents.find((i) => i.state !== 'CLOSED' && i.state !== 'FALSE_ALARM') ?? dmaIncidents[0];
  }, [dmaIncidents]);

  return (
    <DomainContext.Provider
      value={{
        runtimeMode,
        setRuntimeMode,
        persona,
        setPersona,
        apiStatus,
        apiError,
        staleConflict,
        clearStaleConflict: () => setStaleConflict(null),
        refreshBackend,
        persistedBalance,
        persistedNightFlow,
        lastIngestResult,
        assessmentDateAzt,
        setAssessmentDateAzt,
        ingestSyntheticDmaBatch,
        assessSelectedDma,
        clock,
        clockTick,
        simulatedHour,
        isNocturnal,
        jumpToNight,
        resetRealtime,
        setSimulatedHour,
        selectedDmaId,
        setSelectedDmaId,
        activeDbAdapter,
        setActiveDbAdapter,
        incidents,
        dmaIncidents,
        activeIncident,
        selectedIncident,
        setSelectedIncident,
        dispatchIncidentEvent,
        createNewIncident,
        auditLogs,
        hasBurstAnomaly,
        hasTankRefill,
        hasCorruptedPacket,
        lastCorruptedValidationMessage,
        toggleBurstAnomaly,
        toggleTankRefill,
        toggleCorruptedPacket,
        consumers,
        availableSupplyM3,
        setAvailableSupplyM3,
        allocationResult,
        allocationError,
        runAllocation,
        isSolvingAllocation,
        baselineFlowM3h,
        baselinePressureBar,
        postRepairFlowM3h,
        postRepairPressureBar,
        leakageExponent,
        illustrativeTariffAznM3,
        savingsResult,
        setBaselineFlowM3h,
        setBaselinePressureBar,
        setPostRepairFlowM3h,
        setPostRepairPressureBar,
        setLeakageExponent,
        setIllustrativeTariffAznM3,
      }}
    >
      {children}
    </DomainContext.Provider>
  );
};

export const useDomain = (): DomainContextType => {
  const context = useContext(DomainContext);
  if (!context) {
    throw new Error('useDomain must be used within a DomainProvider');
  }
  return context;
};
