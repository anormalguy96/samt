import React, { useState } from 'react';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { Icon } from '../atoms/Icon';
import { FsmStepBadge } from '../molecules/FsmStepBadge';
import { useDomain } from '../../context/DomainContext';
import type { IncidentState } from '../../domain/ports/IncidentPort';

export const LeakLifecycleFsm: React.FC = () => {
  const {
    activeIncident,
    dispatchIncidentEvent,
    createNewIncident,
    selectedDmaId,
    auditLogs,
    runtimeMode,
  } = useDomain();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const steps: { id: IncidentState; label: string; subLabel: string }[] = [
    { id: 'DETECTED', label: '1. Detected', subLabel: 'DETECTED' },
    { id: 'ASSIGNED', label: '2. Assigned', subLabel: 'ASSIGNED' },
    { id: 'IN_REPAIR', label: '3. In Repair', subLabel: 'IN_REPAIR' },
    { id: 'REPAIRED', label: '4. Repaired', subLabel: 'REPAIRED' },
    { id: 'VERIFIED', label: '5. Verified', subLabel: 'VERIFIED' },
    { id: 'CLOSED', label: '6. Closed', subLabel: 'CLOSED' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === activeIncident?.state);

  const handleAdvanceStep = async () => {
    if (!activeIncident) return;
    setErrorMessage(null);
    const id = activeIncident.incidentId;
    const expectedVersion = activeIncident.version;

    switch (activeIncident.state) {
      case 'DETECTED': {
        const res = await dispatchIncidentEvent(
          id,
          {
            type: 'ASSIGN',
            crew: {
              crewId: 'CREW-03',
              crewName: 'Baku Emergency Crew #3',
              crewPhone: '+994 50 234-56-78',
              role: 'Lead Engineer: Kamran Aliyev',
              etaMinutes: 20,
            },
          },
          { expectedVersion }
        );
        if (!res.success) setErrorMessage(res.error || 'Transition error');
        break;
      }
      case 'ASSIGNED': {
        const res = await dispatchIncidentEvent(
          id,
          {
            type: 'START_REPAIR',
            technicianId: 'TECH-KAMRAN',
            checkInGps: '40.3752 N, 49.8152 E',
          },
          { expectedVersion }
        );
        if (!res.success) setErrorMessage(res.error || 'Transition error');
        break;
      }
      case 'IN_REPAIR': {
        const res = await dispatchIncidentEvent(
          id,
          {
            type: 'RECORD_REPAIR_EVIDENCE',
            evidence: {
              technicianId: 'TECH-KAMRAN',
              repairMethod: 'Composite Clamp Installation (Ø200mm)',
              clampType: 'Kraun Coupling Ø200',
              acousticFreqHz: 16,
              photoFixtureRef: 'fixture://photos/repair-yas-01.webp',
              technicianNotes: 'Clamp tightened and pressure restored.',
            },
          },
          { expectedVersion }
        );
        if (!res.success) setErrorMessage(res.error || 'Transition error');
        break;
      }
      case 'REPAIRED': {
        const res = await dispatchIncidentEvent(
          id,
          {
            type: 'EVALUATE_VERIFICATION',
            evidence: {
              baselineMnfM3h: activeIncident.dmaId === 'DMA-NASIMI-02' ? 34.0 : 25.0,
              leakageExponent: 0.5,
              preRepairWindow: {
                windowStart: new Date('2026-10-19T22:00:00Z'),
                windowEnd: new Date('2026-10-20T00:00:00Z'),
                sampleCount: 16,
                coverageRatio: 0.95,
                mnfM3h: 68.4,
                avgPressureBar: 4.0,
                provenance: 'SYNTHETIC_PRE_REPAIR_WINDOW',
              },
              postRepairWindow: {
                windowStart: new Date('2026-10-20T22:00:00Z'),
                windowEnd: new Date('2026-10-21T00:00:00Z'),
                sampleCount: 16,
                coverageRatio: 0.95,
                mnfM3h: 26.2,
                avgPressureBar: 4.0,
                provenance: 'SYNTHETIC_POST_REPAIR_WINDOW',
              },
            },
          },
          { expectedVersion }
        );
        if (!res.success) setErrorMessage(res.error || 'Transition error');
        break;
      }
      case 'VERIFIED': {
        const res = await dispatchIncidentEvent(
          id,
          {
            type: 'CLOSE',
            notes: 'Closed after synthetic verification',
          },
          { expectedVersion }
        );
        if (!res.success) setErrorMessage(res.error || 'Transition error');
        break;
      }
      default:
        break;
    }
  };

  const handleDeclareFalseAlarm = async () => {
    if (!activeIncident) return;
    setErrorMessage(null);
    const res = await dispatchIncidentEvent(
      activeIncident.incidentId,
      {
        type: 'MARK_FALSE_ALARM',
        reason: 'Scheduled secondary building booster test produced pressure transient',
      },
      { expectedVersion: activeIncident.version }
    );
    if (!res.success) setErrorMessage(res.error || 'Transition error');
  };

  const handleCreateNew = async () => {
    setErrorMessage(null);
    await createNewIncident(selectedDmaId, 38.4, `${selectedDmaId} Synthetic Hydraulic Leak`);
  };

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <Icon name="zap" size={16} className="text-cyan-primary" />
            Incident Finite State Machine (FSM) — Scoped to {selectedDmaId}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Guarded transitions with expectedVersion CAS, commandId idempotency, and server-side evidence evaluation
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeIncident && activeIncident.state !== 'CLOSED' && activeIncident.state !== 'FALSE_ALARM' && (
            <>
              <Button
                size="sm"
                variant="primary"
                onClick={handleAdvanceStep}
                rightIcon={<Icon name="check" size={14} />}
              >
                Next Guarded Transition
              </Button>
              {activeIncident.state === 'DETECTED' && (
                <Button size="sm" variant="outline" onClick={handleDeclareFalseAlarm}>
                  Mark False Alarm
                </Button>
              )}
            </>
          )}

          {runtimeMode === 'STATIC_DEMO' &&
            (!activeIncident || activeIncident.state === 'CLOSED' || activeIncident.state === 'FALSE_ALARM') && (
              <Button size="sm" variant="primary" onClick={handleCreateNew} leftIcon={<Icon name="zap" size={14} />}>
                Create Demo Incident
              </Button>
            )}
        </div>
      </Card>

      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-critical/15 border border-rose-critical/40 text-xs font-mono text-rose-critical flex items-center gap-2">
          <Icon name="alert" size={14} />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {steps.map((state, idx) => {
          let status: 'completed' | 'active' | 'upcoming' = 'upcoming';
          if (currentStepIndex >= 0 && idx < currentStepIndex) status = 'completed';
          else if (idx === currentStepIndex) status = 'active';

          return (
            <FsmStepBadge
              key={state.id}
              stepNumber={idx + 1}
              label={state.label}
              subLabel={state.subLabel}
              status={status}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card glow className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-bold text-cyan-primary">
              {activeIncident
                ? `${activeIncident.incidentId} (${activeIncident.dmaId} · v${activeIncident.version})`
                : `No incident for ${selectedDmaId}`}
            </span>
            <Badge
              variant={
                activeIncident?.state === 'VERIFIED'
                  ? 'nominal'
                  : activeIncident?.state === 'CLOSED'
                  ? 'neutral'
                  : activeIncident
                  ? 'warning'
                  : 'neutral'
              }
              showDot
            >
              {activeIncident?.state || 'EMPTY'}
            </Badge>
          </div>

          {!activeIncident ? (
            <div className="text-xs font-mono text-slate-400 py-4">
              Selected DMA ({selectedDmaId}) currently has no incident records. Cross-DMA fallback is disabled.
            </div>
          ) : (
            <div className="space-y-2 text-xs font-mono">
              <p className="text-slate-200">{activeIncident.title}</p>
              {activeIncident.crewAssignment && (
                <div className="p-2 rounded bg-navy-950 border border-slate-800 text-[11px] text-slate-300">
                  <span className="text-cyan-primary font-bold">Crew: </span>
                  {activeIncident.crewAssignment.crewName} (ETA {activeIncident.crewAssignment.etaMinutes} min)
                </div>
              )}
              {activeIncident.repairEvidence && (
                <div className="p-2 rounded bg-navy-950 border border-slate-800 text-[11px] text-slate-300">
                  <span className="text-emerald-brand font-bold">Repair Evidence: </span>
                  {activeIncident.repairEvidence.repairMethod} · {activeIncident.repairEvidence.photoFixtureRef}
                </div>
              )}
              {activeIncident.verificationResult && (
                <div className="p-2 rounded bg-navy-950 border border-emerald-brand/30 text-[11px] text-emerald-brand">
                  <span className="font-bold">Verification ({activeIncident.verificationResult.outcome}): </span>
                  {activeIncident.verificationResult.reason}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
            <span className="text-xs font-mono font-bold text-slate-200">
              Audit Trail ({runtimeMode === 'INTEGRATED_API' ? 'PostgreSQL' : 'RecordingAuditSink'})
            </span>
          </div>

          <div className="space-y-1.5 max-h-[170px] overflow-y-auto pr-1 text-xs font-mono">
            {auditLogs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="p-1.5 rounded bg-navy-950/80 border border-slate-800 flex items-start gap-2"
              >
                <span className="text-slate-500 text-[10px]">
                  {new Date(log.timestamp).toISOString().slice(11, 19)}Z
                </span>
                <span className="text-cyan-primary">[{log.severity}]</span>
                <span className="text-slate-300 flex-1 truncate">{log.message}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
