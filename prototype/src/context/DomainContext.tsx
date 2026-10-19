/**
 * Domain Composition Root & State Context (Lecture 4: Dependency Inversion & DIP)
 * Maintains pure domain instances, repositories, and state above conditional tab mounts.
 * Navigating between tabs does NOT reset incidents, allocations, clock, or test double state.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { FixedClock } from '../domain/ports/Clock';
import { InMemoryIncidentRepository } from '../domain/adapters/InMemoryIncidentRepository';
import { 
  ValidatedJsonFixtureIncidentRepository, 
  INITIAL_FIXTURE_INCIDENTS 
} from '../domain/adapters/ValidatedJsonFixtureIncidentRepository';
import { RecordingAuditSink } from '../domain/adapters/RecordingAuditSink';
import { transitionIncident } from '../domain/incident/incidentStateMachine';
import { 
  allocateConstrainedWater, 
  type ConsumerRequest, 
  type AllocationPlanResult 
} from '../domain/allocation/constrainedAllocation';
import { 
  estimateIllustrativeSavings, 
  type SavingsResult 
} from '../domain/savings/illustrativeSavings';
import type { Incident, IncidentEvent, IIncidentRepository } from '../domain/ports/IncidentPort';
import type { AuditEvent } from '../domain/ports/AuditPort';

export type DbAdapterMode = 'IN_MEMORY' | 'VALIDATED_FIXTURE';

export interface DomainContextType {
  // Clock seam
  clock: FixedClock;
  simulatedHour: number;
  isNocturnal: boolean;
  jumpToNight: () => void;
  resetRealtime: () => void;
  setSimulatedHour: (hour: number) => void;

  // Selected DMA
  selectedDmaId: string;
  setSelectedDmaId: (id: string) => void;

  // Hexagonal Adapters
  activeDbAdapter: DbAdapterMode;
  setActiveDbAdapter: (mode: DbAdapterMode) => void;

  // Incident state machine & repository
  incidents: Incident[];
  selectedIncident: Incident | null;
  setSelectedIncident: (inc: Incident | null) => void;
  dispatchIncidentEvent: (incidentId: string, event: IncidentEvent) => Promise<{ success: boolean; error?: string }>;
  createNewIncident: (dmaId: string, lossM3h: number, title?: string) => Promise<Incident>;
  activeIncident: Incident | undefined; // Incident for selected DMA or top incident

  // Audit double
  auditLogs: AuditEvent[];

  // Fault injection into pipeline
  hasBurstAnomaly: boolean;
  hasTankRefill: boolean;
  hasCorruptedPacket: boolean;
  toggleBurstAnomaly: (val: boolean) => void;
  toggleTankRefill: (val: boolean) => void;
  toggleCorruptedPacket: (val: boolean) => void;

  // Constrained Allocation
  consumers: ConsumerRequest[];
  availableSupplyM3: number;
  setAvailableSupplyM3: (val: number) => void;
  allocationResult: AllocationPlanResult;
  runAllocation: () => void;
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
    weight: 0.90,
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
    weight: 0.70,
    canalCapacityM3: 120,
  },
];

export const DomainProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Single Clock seam
  const clock = useMemo(() => new FixedClock('2026-10-20T14:00:00+04:00'), []);
  const [simulatedHour, setSimulatedHourState] = useState<number>(14);

  // Single Audit Sink (Spy)
  const auditSink = useMemo(() => new RecordingAuditSink(), []);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);

  // Selected DMA
  const [selectedDmaId, setSelectedDmaId] = useState<string>('DMA-YASAMAL-04');

  // Interchangeable Repositories
  const inMemoryRepo = useMemo(() => new InMemoryIncidentRepository(INITIAL_FIXTURE_INCIDENTS), []);
  const fixtureRepo = useMemo(() => new ValidatedJsonFixtureIncidentRepository(INITIAL_FIXTURE_INCIDENTS), []);
  const [activeDbAdapter, setActiveDbAdapter] = useState<DbAdapterMode>('IN_MEMORY');

  const currentRepo: IIncidentRepository = activeDbAdapter === 'IN_MEMORY' ? inMemoryRepo : fixtureRepo;

  // Incident list state
  const [incidents, setIncidents] = useState<Incident[]>(INITIAL_FIXTURE_INCIDENTS);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  // Fault Injections
  const [hasBurstAnomaly, setHasBurstAnomaly] = useState<boolean>(true);
  const [hasTankRefill, setHasTankRefill] = useState<boolean>(true);
  const [hasCorruptedPacket, setHasCorruptedPacket] = useState<boolean>(false);

  // Allocation State
  const [consumers] = useState<ConsumerRequest[]>(INITIAL_CONSUMERS);
  const [availableSupplyM3, setAvailableSupplyM3] = useState<number>(610);
  const [isSolvingAllocation, setIsSolvingAllocation] = useState<boolean>(false);
  const [allocationResult, setAllocationResult] = useState<AllocationPlanResult>(() => 
    allocateConstrainedWater(INITIAL_CONSUMERS, 610)
  );

  // Illustrative Savings State
  const [baselineFlowM3h, setBaselineFlowM3h] = useState<number>(104.2);
  const [baselinePressureBar, setBaselinePressureBar] = useState<number>(4.2);
  const [postRepairFlowM3h, setPostRepairFlowM3h] = useState<number>(76.5);
  const [postRepairPressureBar, setPostRepairPressureBar] = useState<number>(4.0);
  const [leakageExponent, setLeakageExponent] = useState<number>(0.5);
  const [illustrativeTariffAznM3, setIllustrativeTariffAznM3] = useState<number>(0.40);

  const savingsResult = useMemo(() => {
    return estimateIllustrativeSavings({
      baselineFlowM3h,
      baselinePressureBar,
      postRepairFlowM3h,
      postRepairPressureBar,
      leakageExponent,
      illustrativeTariffAznM3,
    });
  }, [baselineFlowM3h, baselinePressureBar, postRepairFlowM3h, postRepairPressureBar, leakageExponent, illustrativeTariffAznM3]);

  // Load incidents from current repository
  const refreshIncidents = useCallback(async () => {
    const list = await currentRepo.getAll();
    setIncidents(list);
    setAuditLogs(auditSink.getEvents().slice(-20).reverse());
  }, [currentRepo, auditSink]);

  useEffect(() => {
    refreshIncidents();
  }, [activeDbAdapter, refreshIncidents]);

  // Clock methods
  const isNocturnal = simulatedHour >= 2 && simulatedHour < 4;

  const setSimulatedHour = useCallback((hour: number) => {
    setSimulatedHourState(hour);
    const dateStr = `2026-10-20T${String(hour).padStart(2, '0')}:00:00+04:00`;
    clock.setTime(dateStr);
    auditSink.record({
      id: `clk-${Date.now()}`,
      timestamp: clock.now(),
      eventType: 'CLOCK_SEAM_ADJUSTED',
      sourceComponent: 'TestabilityHarness',
      severity: 'INFO',
      message: `Clock seam time travel set to ${String(hour).padStart(2, '0')}:00 AZT`,
    });
    setAuditLogs(auditSink.getEvents().slice(-20).reverse());
  }, [clock, auditSink]);

  const jumpToNight = useCallback(() => {
    setSimulatedHour(3);
  }, [setSimulatedHour]);

  const resetRealtime = useCallback(() => {
    setSimulatedHour(14);
  }, [setSimulatedHour]);

  // Incident state transitions
  const dispatchIncidentEvent = useCallback(async (
    incidentId: string, 
    event: IncidentEvent
  ): Promise<{ success: boolean; error?: string }> => {
    const inc = await currentRepo.getById(incidentId);
    if (!inc) {
      return { success: false, error: `Incident ${incidentId} not found` };
    }

    const result = transitionIncident(inc, event, clock);
    if (!result.success) {
      auditSink.record({
        id: `aud-err-${Date.now()}`,
        timestamp: clock.now(),
        eventType: 'TRANSITION_GUARD_REJECTED',
        sourceComponent: 'IncidentFSM',
        severity: 'WARN',
        message: `Guard rejected on incident ${incidentId}: ${result.error}`,
      });
      setAuditLogs(auditSink.getEvents().slice(-20).reverse());
      return { success: false, error: result.error };
    }

    await currentRepo.update(result.incident);
    auditSink.record({
      id: `aud-${Date.now()}`,
      timestamp: clock.now(),
      eventType: 'INCIDENT_TRANSITIONED',
      sourceComponent: 'IncidentFSM',
      severity: result.incident.state === 'VERIFIED' ? 'SUCCESS' : 'INFO',
      message: result.transitionDescription,
    });

    await refreshIncidents();
    if (selectedIncident?.incidentId === incidentId) {
      setSelectedIncident(result.incident);
    }

    return { success: true };
  }, [currentRepo, clock, auditSink, refreshIncidents, selectedIncident]);

  const createNewIncident = useCallback(async (
    dmaId: string, 
    lossM3h: number, 
    title?: string
  ): Promise<Incident> => {
    const newInc: Incident = {
      incidentId: `INC-${Date.now().toString().slice(-6)}`,
      dmaId,
      title: title || `${dmaId} Hidravlik Sızma Anomaliyası`,
      detectedAt: clock.now(),
      state: 'DETECTED',
      severity: lossM3h > 30 ? 'CRITICAL' : 'MEDIUM',
      estimatedLossM3h: parseFloat(lossM3h.toFixed(1)),
      version: 1,
    };
    await currentRepo.save(newInc);
    auditSink.record({
      id: `aud-${Date.now()}`,
      timestamp: clock.now(),
      eventType: 'NEW_INCIDENT_REGISTERED',
      sourceComponent: 'MnfBaselineFilter',
      severity: 'ERROR',
      message: `New incident registered for ${dmaId}: +${lossM3h.toFixed(1)} m³/h excess loss`,
    });
    await refreshIncidents();
    return newInc;
  }, [currentRepo, clock, auditSink, refreshIncidents]);

  // Allocation solver trigger
  const runAllocation = useCallback(() => {
    setIsSolvingAllocation(true);
    setTimeout(() => {
      const plan = allocateConstrainedWater(consumers, availableSupplyM3);
      setAllocationResult(plan);
      setIsSolvingAllocation(false);
      auditSink.record({
        id: `aud-alloc-${Date.now()}`,
        timestamp: clock.now(),
        eventType: 'ALLOCATION_COMPUTED',
        sourceComponent: 'ConstrainedAllocationEngine',
        severity: 'INFO',
        message: `Constrained allocation computed for ${availableSupplyM3} min m³ (Gini: ${plan.giniIndex})`,
      });
      setAuditLogs(auditSink.getEvents().slice(-20).reverse());
    }, 250);
  }, [consumers, availableSupplyM3, clock, auditSink]);

  // Fault toggles with direct pipeline propagation
  const toggleBurstAnomaly = useCallback((val: boolean) => {
    setHasBurstAnomaly(val);
    auditSink.record({
      id: `aud-${Date.now()}`,
      timestamp: clock.now(),
      eventType: 'FAULT_BURST_TOGGLED',
      sourceComponent: 'SyntheticGenerator',
      severity: val ? 'WARN' : 'INFO',
      message: val ? 'Injected Torricelli transient burst (+38.4 m³/h)' : 'Disabled transient burst anomaly',
    });
    setAuditLogs(auditSink.getEvents().slice(-20).reverse());
  }, [clock, auditSink]);

  const toggleTankRefill = useCallback((val: boolean) => {
    setHasTankRefill(val);
    auditSink.record({
      id: `aud-${Date.now()}`,
      timestamp: clock.now(),
      eventType: 'FAULT_TANK_TOGGLED',
      sourceComponent: 'SyntheticGenerator',
      severity: 'INFO',
      message: val ? 'Enabled rooftop tank refill chattering' : 'Disabled tank refill pattern',
    });
    setAuditLogs(auditSink.getEvents().slice(-20).reverse());
  }, [clock, auditSink]);

  const toggleCorruptedPacket = useCallback((val: boolean) => {
    setHasCorruptedPacket(val);
    auditSink.record({
      id: `aud-${Date.now()}`,
      timestamp: clock.now(),
      eventType: 'FAULT_CORRUPTION_TOGGLED',
      sourceComponent: 'SyntheticGenerator',
      severity: val ? 'ERROR' : 'INFO',
      message: val ? 'Injecting corrupted packet CRC-32 (Quarantine test)' : 'Disabled corrupted packet injection',
    });
    setAuditLogs(auditSink.getEvents().slice(-20).reverse());
  }, [clock, auditSink]);

  const activeIncident = useMemo(() => {
    return incidents.find((i) => i.dmaId === selectedDmaId) || incidents[0];
  }, [incidents, selectedDmaId]);

  return (
    <DomainContext.Provider
      value={{
        clock,
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
        selectedIncident,
        setSelectedIncident,
        dispatchIncidentEvent,
        createNewIncident,
        activeIncident,
        auditLogs,
        hasBurstAnomaly,
        hasTankRefill,
        hasCorruptedPacket,
        toggleBurstAnomaly,
        toggleTankRefill,
        toggleCorruptedPacket,
        consumers,
        availableSupplyM3,
        setAvailableSupplyM3,
        allocationResult,
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
