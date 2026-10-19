import { describe, it, expect } from 'vitest';
import { FixedClock } from '../domain/ports/Clock';
import { StandardMeterRegistry } from '../domain/adapters/StandardMeterRegistry';
import { TelemetryValidator } from '../domain/telemetry/validation';
import { integrateFlowVolume, type FlowSample } from '../domain/balance/flowIntegration';
import { calculateWaterBalance } from '../domain/balance/waterBalance';
import { evaluateMinimumNightFlow } from '../domain/nightflow/nightWindowFilter';
import { transitionIncident } from '../domain/incident/incidentStateMachine';
import { InMemoryIncidentRepository } from '../domain/adapters/InMemoryIncidentRepository';
import { RecordingAuditSink } from '../domain/adapters/RecordingAuditSink';
import { allocateConstrainedWater } from '../domain/allocation/constrainedAllocation';
import { estimateIllustrativeSavings } from '../domain/savings/illustrativeSavings';
import type { Incident } from '../domain/ports/IncidentPort';
import type { TelemetryObservation } from '../domain/ports/TelemetryPort';

describe('Connected End-to-End Synthetic DMA Workflow (Principal Course Demonstration)', () => {
  it('executes full pipeline: ingest -> validate -> balance -> MNF -> incident -> repair -> verification -> allocation', async () => {
    // 0. Setup injectable dependencies (Seams & Ports)
    const clock = new FixedClock('2026-10-20T03:00:00+04:00'); // Set time to nocturnal window 03:00 AZT
    const registry = new StandardMeterRegistry();
    const validator = new TelemetryValidator(clock, registry, { clientCertificateValid: true });
    const incidentRepo = new InMemoryIncidentRepository();
    const auditSink = new RecordingAuditSink();

    const dmaId = 'DMA-YASAMAL-04';
    const baselineMnf = 25.0; // Baseline dry-weather MNF is 25.0 m³/h

    // 1. Ingest raw edge observations
    const inletObs: TelemetryObservation = {
      observationId: 'OBS-YAS-001',
      deviceId: 'GW-YAS-01',
      meterId: 'FM-YAS-INLET-01',
      dmaId,
      metric: 'FLOW_M3H',
      value: 68.4, // Spiked flow during 03:00 AM window!
      observedAt: clock.now(),
      receivedAt: clock.now(),
      quality: 'VALID',
      batteryVolts: 3.6,
    };
    const outletObs: TelemetryObservation = {
      observationId: 'OBS-YAS-002',
      deviceId: 'GW-YAS-02',
      meterId: 'FM-YAS-OUTLET-01',
      dmaId,
      metric: 'FLOW_M3H',
      value: 20.0,
      observedAt: clock.now(),
      receivedAt: clock.now(),
      quality: 'VALID',
      batteryVolts: 3.5,
    };

    // 2. Validate observations (DbC Preconditions)
    const valInlet = validator.validate(inletObs);
    const valOutlet = validator.validate(outletObs);
    expect(valInlet.accepted).toBe(true);
    expect(valOutlet.accepted).toBe(true);

    // 3. Trapezoidal volume integration over 15-minute window [03:00, 03:15)
    const windowStart = clock.now();
    const windowEnd = new Date(windowStart.getTime() + 15 * 60 * 1000);

    const inletSamples: FlowSample[] = [
      { timestamp: windowStart, flowM3h: inletObs.value },
      { timestamp: windowEnd, flowM3h: inletObs.value },
    ];
    const outletSamples: FlowSample[] = [
      { timestamp: windowStart, flowM3h: outletObs.value },
      { timestamp: windowEnd, flowM3h: outletObs.value },
    ];

    const inletVol = integrateFlowVolume(inletSamples, { windowStart, windowEnd });
    const outletVol = integrateFlowVolume(outletSamples, { windowStart, windowEnd });

    // 68.4 m³/h * 0.25 h = 17.1 m³
    expect(inletVol.totalVolumeM3).toBeCloseTo(17.1, 1);
    // 20.0 m³/h * 0.25 h = 5.0 m³
    expect(outletVol.totalVolumeM3).toBeCloseTo(5.0, 1);

    // 4. Calculate boundary water balance
    const balance = calculateWaterBalance({
      dmaId,
      dmaName: 'Yasamal DMA-04',
      windowStart,
      windowEnd,
      inletContributions: [
        {
          meterId: inletObs.meterId,
          meterName: 'Inlet',
          role: 'INLET',
          volumeM3: inletVol.totalVolumeM3,
          averageFlowM3h: inletVol.averageFlowM3h,
          coverageRatio: inletVol.coverageRatio,
        },
      ],
      outletContributions: [
        {
          meterId: outletObs.meterId,
          meterName: 'Outlet',
          role: 'OUTLET',
          volumeM3: outletVol.totalVolumeM3,
          averageFlowM3h: outletVol.averageFlowM3h,
          coverageRatio: outletVol.coverageRatio,
        },
      ],
      authorizedBilledConsumptionM3: 3.0,
      storageChangeM3: 0.0,
    });

    // Net residual: 17.1 - 5.0 - 3.0 = 9.1 m³ (excess loss!)
    expect(balance.signedResidualM3).toBeCloseTo(9.1, 1);
    expect(balance.status).toBe('CRITICAL_LEAK');

    // 5. Evaluate Minimum Night Flow (MNF) evidence
    const mnfEvaluation = evaluateMinimumNightFlow(inletSamples, baselineMnf);
    expect(mnfEvaluation.isWithinNightWindow).toBe(true);
    expect(mnfEvaluation.isAnomalyDetected).toBe(true);
    expect(mnfEvaluation.excessNightFlowM3h).toBeGreaterThan(30.0);

    // 6. Create Incident from detected hydraulic anomaly
    const newIncident: Incident = {
      incidentId: 'INC-WORKFLOW-YAS-001',
      dmaId,
      pipeSegmentId: 'PIPE-YAS-4412',
      title: 'Yasamal H. Cavid prospekti Boru Qəzası (MNF Sıçrayışı)',
      detectedAt: clock.now(),
      state: 'DETECTED',
      severity: 'CRITICAL',
      estimatedLossM3h: mnfEvaluation.excessNightFlowM3h,
      version: 1,
    };
    await incidentRepo.save(newIncident);
    auditSink.record({
      id: 'aud-001',
      timestamp: clock.now(),
      eventType: 'INCIDENT_DETECTED',
      sourceComponent: 'MnfEvaluationEngine',
      severity: 'ERROR',
      message: `Critical leak detected: +${mnfEvaluation.excessNightFlowM3h.toFixed(1)} m³/h above baseline`,
    });

    // 7. Dispatch & Assign Field Crew
    const assigned = transitionIncident(
      newIncident,
      {
        type: 'ASSIGN',
        crew: {
          crewId: 'CREW-03',
          crewName: 'Bakı Qəza-Bərpa Briqadası #3',
          crewPhone: '+994 50 234-56-78',
          role: 'Baş Mühəndis: Kamran Əliyev',
          etaMinutes: 25,
          assignedAt: clock.now(),
        },
      },
      clock
    );
    expect(assigned.success).toBe(true);
    await incidentRepo.update(assigned.incident);
    await auditSink.notify(assigned.incident.crewAssignment!.crewPhone, 'Dispatched to Yasamal DMA-04', 'CRITICAL');

    // 8. Crew Arrives & Records Repair Evidence
    clock.advanceMinutes(30);
    const inRepair = transitionIncident(assigned.incident, { type: 'START_REPAIR', technicianId: 'TECH-KAMRAN' }, clock);
    expect(inRepair.success).toBe(true);
    await incidentRepo.update(inRepair.incident);

    clock.advanceMinutes(45);
    const repaired = transitionIncident(
      inRepair.incident,
      {
        type: 'RECORD_REPAIR_EVIDENCE',
        evidence: {
          technicianId: 'TECH-KAMRAN',
          repairMethod: 'Kompozit Klemma (Ø200mm) Quraşdırıldı',
          clampType: 'Mufta Kraun Ø200',
          acousticFreqHz: 15,
          photoFixtureRef: 'fixture://photos/repair-yas-4412.webp',
          completedAt: clock.now(),
          technicianNotes: 'Qəza ləğv edildi, boru təzyiq altına alındı.',
        },
      },
      clock
    );
    expect(repaired.success).toBe(true);
    expect(repaired.incident.state).toBe('REPAIRED');
    await incidentRepo.update(repaired.incident);

    // 9. Post-Repair Verification Evaluation (True evaluation, not click-through!)
    // Post-repair nocturnal flow drops back to 26.2 m³/h (within 1.05 * 25.0 baseline = 26.25 m³/h)
    const verified = transitionIncident(
      repaired.incident,
      {
        type: 'EVALUATE_VERIFICATION',
        evaluation: {
          evaluatedAt: clock.now(),
          preRepairMnfM3h: 68.4,
          postRepairMnfM3h: 26.2,
          baselineMnfM3h: 25.0,
          verifiedLossDropM3h: 42.2,
          isSuccessful: true,
          reason: 'Post-repair nocturnal flow (26.2 m³/h) restored to within baseline tolerance',
        },
      },
      clock
    );
    expect(verified.success).toBe(true);
    expect(verified.incident.state).toBe('VERIFIED');
    await incidentRepo.update(verified.incident);

    // 10. Illustrative Savings Estimation (Pressure Normalized)
    const savings = estimateIllustrativeSavings({
      baselineFlowM3h: 68.4,
      baselinePressureBar: 4.8,
      postRepairFlowM3h: 26.2,
      postRepairPressureBar: 4.6, // Slight pressure stabilization
      leakageExponent: 0.5,
      illustrativeTariffAznM3: 0.40,
    });
    expect(savings.isLeakReductionVerified).toBe(true);
    expect(savings.pressureAdjustedHourlySavingsM3h).toBeGreaterThan(38.0);
    expect(savings.dailySavingsM3).toBeGreaterThan(900.0);

    // 11. Complete Standalone Allocation Run
    const allocationResult = allocateConstrainedWater(
      [
        { id: '1', name: 'Gəncə', region: 'K1', demandM3: 140, weight: 0.9, canalCapacityM3: 150 },
        { id: '2', name: 'Aran', region: 'K2', demandM3: 210, weight: 0.85, canalCapacityM3: 220 },
        { id: '3', name: 'Abşeron', region: 'K3', demandM3: 85, weight: 0.75, canalCapacityM3: 100 },
        { id: '4', name: 'Qarabağ', region: 'K4', demandM3: 160, weight: 0.95, canalCapacityM3: 180 },
        { id: '5', name: 'Muğan', region: 'K5', demandM3: 110, weight: 0.7, canalCapacityM3: 120 },
      ],
      900 // Supply 900 for demand 705
    );
    expect(allocationResult.totalAllocatedM3).toBe(705);
    expect(allocationResult.unmetDemandM3).toBe(0);

    // Verify spy recorded all interactions
    expect(auditSink.getEvents().length).toBeGreaterThanOrEqual(1);
    expect(auditSink.getNotifications().length).toBe(1);
  });
});
