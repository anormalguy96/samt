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
    auditLogs 
  } = useDomain();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const steps: { id: IncidentState; label: string; subLabel: string }[] = [
    { id: 'DETECTED', label: '1. Aşkarlanma', subLabel: 'DETECTED' },
    { id: 'ASSIGNED', label: '2. Təyinat', subLabel: 'ASSIGNED' },
    { id: 'IN_REPAIR', label: '3. Təmirdə', subLabel: 'IN_REPAIR' },
    { id: 'REPAIRED', label: '4. Təmir olundu', subLabel: 'REPAIRED' },
    { id: 'VERIFIED', label: '5. Təsdiqləndi', subLabel: 'VERIFIED' },
    { id: 'CLOSED', label: '6. Arxivləndi', subLabel: 'CLOSED' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === activeIncident?.state);

  const handleAdvanceStep = async () => {
    if (!activeIncident) return;
    setErrorMessage(null);

    const id = activeIncident.incidentId;

    switch (activeIncident.state) {
      case 'DETECTED': {
        const res = await dispatchIncidentEvent(id, {
          type: 'ASSIGN',
          crew: {
            crewId: 'CREW-03',
            crewName: 'Bakı Qəza-Bərpa Briqadası #3',
            crewPhone: '+994 50 234-56-78',
            role: 'Baş Mühəndis: Kamran Əliyev',
            etaMinutes: 20,
            assignedAt: new Date(),
          },
        });
        if (!res.success) setErrorMessage(res.error || 'Xəta baş verdi');
        break;
      }

      case 'ASSIGNED': {
        const res = await dispatchIncidentEvent(id, {
          type: 'START_REPAIR',
          technicianId: 'TECH-KAMRAN',
          checkInGps: '40.3752° N, 49.8152° E',
        });
        if (!res.success) setErrorMessage(res.error || 'Xəta baş verdi');
        break;
      }

      case 'IN_REPAIR': {
        const res = await dispatchIncidentEvent(id, {
          type: 'RECORD_REPAIR_EVIDENCE',
          evidence: {
            technicianId: 'TECH-KAMRAN',
            repairMethod: 'Kompozit Klemma Quraşdırılması (Ø200mm)',
            clampType: 'Mufta Kraun Ø200',
            acousticFreqHz: 16,
            photoFixtureRef: 'fixture://photos/repair-yas-01.webp',
            completedAt: new Date(),
            technicianNotes: 'Klemma bərkidildi, təzyiq bərpa olundu.',
          },
        });
        if (!res.success) setErrorMessage(res.error || 'Xəta baş verdi');
        break;
      }

      case 'REPAIRED': {
        const res = await dispatchIncidentEvent(id, {
          type: 'EVALUATE_VERIFICATION',
          evaluation: {
            evaluatedAt: new Date(),
            preRepairMnfM3h: 68.4,
            postRepairMnfM3h: 26.2,
            baselineMnfM3h: 25.0,
            verifiedLossDropM3h: 42.2,
            isSuccessful: true,
            reason: 'Gecə axını (26.2 m³/h) ilkin baza diapazonuna qayıtdı (təsdiqləndi)',
          },
        });
        if (!res.success) setErrorMessage(res.error || 'Xəta baş verdi');
        break;
      }

      case 'VERIFIED': {
        const res = await dispatchIncidentEvent(id, {
          type: 'CLOSE',
          closedBy: 'ADSEA-DISPETCHER-BAKU',
        });
        if (!res.success) setErrorMessage(res.error || 'Xəta baş verdi');
        break;
      }

      default:
        break;
    }
  };

  const handleDeclareFalseAlarm = async () => {
    if (!activeIncident) return;
    setErrorMessage(null);
    const res = await dispatchIncidentEvent(activeIncident.incidentId, {
      type: 'MARK_FALSE_ALARM',
      reviewerId: 'MÜFƏTTİŞ-BAKU-01',
      reason: 'İkincil bina nasosunun planlı sınağı təzyiq dalğası yaratmışdı',
    });
    if (!res.success) setErrorMessage(res.error || 'Xəta');
  };

  const handleCreateNew = async () => {
    setErrorMessage(null);
    await createNewIncident(selectedDmaId, 38.4, `${selectedDmaId} Yeni Hidravlik Sızma`);
  };

  return (
    <div className="space-y-5">
      {/* Header and Step Action */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <Icon name="zap" size={16} className="text-cyan-primary" />
            Sızma insidentlərinin sonlu vəziyyət maşını (FSM)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Mühazirə 2: Formal vəziyyət keçidləri, invariantlar və qoruyucu şərtlər (guards)
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
                Növbəti qorunan keçid
              </Button>
              {activeIncident.state === 'DETECTED' && (
                <Button size="sm" variant="outline" onClick={handleDeclareFalseAlarm}>
                  Yalançı həyəcan elan et
                </Button>
              )}
            </>
          )}

          {(!activeIncident || activeIncident.state === 'CLOSED' || activeIncident.state === 'FALSE_ALARM') && (
            <Button size="sm" variant="primary" onClick={handleCreateNew} leftIcon={<Icon name="zap" size={14} />}>
              Yeni sızma insidenti yarat
            </Button>
          )}
        </div>
      </Card>

      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-critical/15 border border-rose-critical/40 text-xs font-mono text-rose-critical flex items-center gap-2">
          <Icon name="alert" size={14} />
          <span>Qoruyucu şərt pozuntusu (Guard rejected): {errorMessage}</span>
        </div>
      )}

      {/* Visual Step Indicator */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {steps.map((state, idx) => {
          let status: 'completed' | 'active' | 'upcoming' = 'upcoming';
          if (idx < currentStepIndex) status = 'completed';
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

      {/* Active State Invariants & Guards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card glow className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-bold text-cyan-primary">
              Cari insident: {activeIncident?.incidentId || 'Yoxdur'} ({activeIncident?.dmaId})
            </span>
            <Badge 
              variant={
                activeIncident?.state === 'VERIFIED'
                  ? 'nominal'
                  : activeIncident?.state === 'CLOSED'
                  ? 'neutral'
                  : 'warning'
              } 
              showDot
            >
              {activeIncident?.state || 'Aktiv insident yoxdur'}
            </Badge>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[11px]">Təsvir:</span>
              <p className="text-slate-200 mt-0.5">{activeIncident?.title}</p>
            </div>
            {activeIncident?.crewAssignment && (
              <div className="p-2 rounded bg-navy-950 border border-slate-800 text-[11px] text-slate-300">
                <span className="text-cyan-primary font-bold">Təyin olunmuş briqada: </span>
                {activeIncident.crewAssignment.crewName} ({activeIncident.crewAssignment.crewPhone}) · ETA: {activeIncident.crewAssignment.etaMinutes} dəq
              </div>
            )}
            {activeIncident?.repairEvidence && (
              <div className="p-2 rounded bg-navy-950 border border-slate-800 text-[11px] text-slate-300">
                <span className="text-emerald-brand font-bold">Təmir aktı: </span>
                {activeIncident.repairEvidence.repairMethod} · Foto: {activeIncident.repairEvidence.photoFixtureRef}
              </div>
            )}
            {activeIncident?.verificationResult && (
              <div className="p-2 rounded bg-navy-950 border border-emerald-brand/30 text-[11px] text-emerald-brand">
                <span className="font-bold">Hidravlik təsdiq: </span>
                İlkin MNF: {activeIncident.verificationResult.preRepairMnfM3h} m³/h → Təmirdən sonra: {activeIncident.verificationResult.postRepairMnfM3h} m³/h ({activeIncident.verificationResult.reason})
              </div>
            )}
            {activeIncident?.state === 'CLOSED' && (
              <div className="p-2 rounded bg-navy-950 border border-slate-800 text-[11px] text-slate-400">
                İnsident arxivlənib. Terminal vəziyyətdir (dövrəyə qayıtmır).
              </div>
            )}
          </div>
        </Card>

        {/* Real Audit Sink (Test Double Spy) */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
            <span className="text-xs font-mono font-bold text-slate-200">
              Domen audit keçid jurnalı (RecordingAuditSink Spy)
            </span>
            <span className="text-[10px] font-mono text-cyan-primary">Yaddaşda qeyd</span>
          </div>

          <div className="space-y-1.5 max-h-[170px] overflow-y-auto pr-1 text-xs font-mono">
            {auditLogs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="p-1.5 rounded bg-navy-950/80 border border-slate-800 flex items-start gap-2"
              >
                <span className="text-slate-500 text-[10px]">
                  {new Date(log.timestamp).toLocaleTimeString('az-AZ')}
                </span>
                <span
                  className={
                    log.severity === 'SUCCESS'
                      ? 'text-emerald-brand font-bold'
                      : log.severity === 'ERROR'
                      ? 'text-rose-critical font-bold'
                      : log.severity === 'WARN'
                      ? 'text-amber-warning font-bold'
                      : 'text-cyan-primary'
                  }
                >
                  [{log.severity}]
                </span>
                <span className="text-slate-300 flex-1 truncate">{log.message}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
