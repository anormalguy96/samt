import React, { useState } from 'react';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { Modal } from '../atoms/Modal';
import { Icon } from '../atoms/Icon';
import { useDomain } from '../../context/DomainContext';
import type { Incident } from '../../domain/ports/IncidentPort';

export const WorkOrderManager: React.FC = () => {
  const {
    runtimeMode,
    persona,
    apiStatus,
    selectedDmaId,
    dmaIncidents,
    incidents,
    auditLogs,
    dispatchIncidentEvent,
    ingestSyntheticDmaBatch,
    assessSelectedDma,
    refreshBackend,
  } = useDomain();

  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Verification evidence inputs (never includes a client isSuccessful boolean!)
  const [postRepairMnfInput, setPostRepairMnfInput] = useState<string>('26.0');
  const [postRepairPressureInput, setPostRepairPressureInput] = useState<string>('4.0');
  const [postRepairCoverageInput, setPostRepairCoverageInput] = useState<string>('0.95');
  const [postRepairSamplesInput, setPostRepairSamplesInput] = useState<string>('16');
  const [scopeAllDmas, setScopeAllDmas] = useState<boolean>(false);

  const displayedIncidents = scopeAllDmas ? incidents : dmaIncidents;
  const selectedIncident: Incident | null =
    incidents.find((i) => i.incidentId === selectedIncidentId) ?? null;

  const openModal = (incident: Incident) => {
    setSelectedIncidentId(incident.incidentId);
    setActionError(null);
    setActionNotice(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActionError(null);
  };

  const handleIngestAndAssess = async (
    scenario: 'LIVE_ANOMALY' | 'HISTORICAL_REPLAY' | 'CORRUPTED'
  ) => {
    setIsSubmitting(true);
    setActionError(null);
    setActionNotice(null);
    const res = await ingestSyntheticDmaBatch(scenario);
    setActionNotice(res.message);
    if (!res.ok) setActionError(res.message);
    setIsSubmitting(false);
  };

  const handleAssessDma = async () => {
    setIsSubmitting(true);
    setActionError(null);
    setActionNotice(null);
    const res = await assessSelectedDma();
    if (!res.ok) setActionError(res.message);
    else setActionNotice(res.message);
    setIsSubmitting(false);
  };

  const handleAdvance = async () => {
    if (!selectedIncident) return;
    setActionError(null);
    setActionNotice(null);
    setIsSubmitting(true);

    const id = selectedIncident.incidentId;
    const expectedVersion = selectedIncident.version;
    let outcome;

    if (selectedIncident.state === 'DETECTED') {
      outcome = await dispatchIncidentEvent(
        id,
        {
          type: 'ASSIGN',
          crew: {
            crewId: 'CREW-01',
            crewName: 'Baku Emergency Repair Crew #1',
            crewPhone: '+994 50 876-54-32',
            role: 'Lead Engineer: Rashad Aliyev',
            etaMinutes: 20,
          },
        },
        { expectedVersion }
      );
    } else if (selectedIncident.state === 'ASSIGNED') {
      outcome = await dispatchIncidentEvent(
        id,
        {
          type: 'START_REPAIR',
          technicianId: 'TECH-RASHAD',
          checkInGps: '40.3752 N, 49.8152 E',
        },
        { expectedVersion }
      );
    } else if (selectedIncident.state === 'IN_REPAIR') {
      outcome = await dispatchIncidentEvent(
        id,
        {
          type: 'RECORD_REPAIR_EVIDENCE',
          evidence: {
            technicianId: 'TECH-RASHAD',
            repairMethod: 'Steel Welding Coupling Ø150mm',
            clampType: 'Ductile Iron Clamp',
            acousticFreqHz: 16,
            photoFixtureRef: 'fixture://photos/wo-repair-complete.webp',
            technicianNotes: 'Leak point sealed under pressure.',
          },
        },
        { expectedVersion }
      );
    } else if (selectedIncident.state === 'REPAIRED') {
      const postMnf = Number(postRepairMnfInput);
      const postPress = Number(postRepairPressureInput);
      const postCov = Number(postRepairCoverageInput);
      const postSamples = Number(postRepairSamplesInput);
      if (
        !Number.isFinite(postMnf) ||
        postMnf < 0 ||
        !Number.isFinite(postPress) ||
        postPress <= 0 ||
        !Number.isFinite(postCov) ||
        postCov < 0 ||
        postCov > 1 ||
        !Number.isInteger(postSamples) ||
        postSamples < 0
      ) {
        setActionError('Invalid numeric verification evidence inputs.');
        setIsSubmitting(false);
        return;
      }

      const preStart = new Date('2026-10-19T22:00:00Z'); // 02:00 AZT
      const preEnd = new Date('2026-10-20T00:00:00Z'); // 04:00 AZT
      const postStart = new Date('2026-10-20T22:00:00Z');
      const postEnd = new Date('2026-10-21T00:00:00Z');

      outcome = await dispatchIncidentEvent(
        id,
        {
          type: 'EVALUATE_VERIFICATION',
          evidence: {
            baselineMnfM3h: selectedIncident.dmaId === 'DMA-NASIMI-02' ? 34.0 : 25.0,
            leakageExponent: 0.5,
            preRepairWindow: {
              windowStart: preStart,
              windowEnd: preEnd,
              sampleCount: 16,
              coverageRatio: 0.95,
              mnfM3h: Math.max(40, selectedIncident.estimatedLossM3h + 25.0),
              avgPressureBar: 4.0,
              provenance: 'SYNTHETIC_PRE_REPAIR_WINDOW',
            },
            postRepairWindow: {
              windowStart: postStart,
              windowEnd: postEnd,
              sampleCount: postSamples,
              coverageRatio: postCov,
              mnfM3h: postMnf,
              avgPressureBar: postPress,
              provenance: 'SYNTHETIC_POST_REPAIR_WINDOW',
            },
          },
        },
        { expectedVersion }
      );
    } else if (selectedIncident.state === 'VERIFIED' || selectedIncident.state === 'FALSE_ALARM') {
      outcome = await dispatchIncidentEvent(
        id,
        {
          type: 'CLOSE',
          notes: 'Closed after evidence verification and audit review',
        },
        { expectedVersion }
      );
    }

    setIsSubmitting(false);

    if (outcome && !outcome.success) {
      // Never claim success on a failed write! Keep modal open so operator sees the exact error/conflict.
      setActionError(`${outcome.errorCode ?? 'ERROR'} (${outcome.status ?? 400}): ${outcome.error}`);
      return;
    }

    setActionNotice(`Transition committed cleanly (next state updated).`);
  };

  const activeCount = displayedIncidents.filter(
    (i) => i.state !== 'CLOSED' && i.state !== 'FALSE_ALARM'
  ).length;
  const closedCount = displayedIncidents.filter(
    (i) => i.state === 'CLOSED' || i.state === 'VERIFIED'
  ).length;

  const incidentAudits = selectedIncident
    ? auditLogs.filter((a) => a.incidentId === selectedIncident.incidentId)
    : auditLogs.slice(0, 12);

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <Icon name="alert" size={16} className="text-cyan-primary" />
            Incident Work Orders & Operational Workflow ({selectedDmaId})
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Scoped strictly to {scopeAllDmas ? 'all configured DMAs' : selectedDmaId} · Role: {persona} · Mode: {runtimeMode}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={scopeAllDmas ? 'outline' : 'primary'}
            onClick={() => setScopeAllDmas(!scopeAllDmas)}
          >
            {scopeAllDmas ? `Scope to ${selectedDmaId}` : 'Show All DMAs'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => refreshBackend()}>
            Refresh
          </Button>
          <Badge variant="critical" showDot>
            {activeCount} active
          </Badge>
          <Badge variant="nominal" showDot>
            {closedCount} verified/closed
          </Badge>
        </div>
      </Card>

      {/* Synthetic Ingestion & Assessment Action Bar */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-mono font-bold text-cyan-primary">
            Synthetic Telemetry Pipeline Triggers ({selectedDmaId})
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            Routes authenticated batches through POST /v1/telemetry/batch &amp; POST /v1/dma/{selectedDmaId}/assess
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            isLoading={isSubmitting}
            onClick={() => handleIngestAndAssess('LIVE_ANOMALY')}
          >
            Send Live Flow Batch
          </Button>
          <Button
            size="sm"
            variant="outline"
            isLoading={isSubmitting}
            onClick={() => handleIngestAndAssess('HISTORICAL_REPLAY')}
          >
            Send Historical Replay (No Live Dispatch)
          </Button>
          <Button
            size="sm"
            variant="danger"
            isLoading={isSubmitting}
            onClick={() => handleIngestAndAssess('CORRUPTED')}
          >
            Send Invalid Reading (DbC Reject)
          </Button>
          {runtimeMode === 'INTEGRATED_API' && (
            <Button
              size="sm"
              variant="secondary"
              isLoading={isSubmitting}
              onClick={handleAssessDma}
            >
              Assess Persisted Night Flow
            </Button>
          )}
        </div>

        {actionNotice && !actionError && (
          <div className="p-2.5 rounded-lg bg-emerald-brand/10 border border-emerald-brand/30 text-xs font-mono text-emerald-brand">
            {actionNotice}
          </div>
        )}
        {actionError && !isModalOpen && (
          <div className="p-2.5 rounded-lg bg-rose-critical/15 border border-rose-critical/40 text-xs font-mono text-rose-critical">
            {actionError}
          </div>
        )}
      </Card>

      {/* Loading / Empty / Incident Grid */}
      {apiStatus === 'LOADING' ? (
        <Card className="p-8 text-center text-xs font-mono text-slate-400">
          Loading persisted incidents from PostgreSQL...
        </Card>
      ) : displayedIncidents.length === 0 ? (
        <Card
          data-testid="empty-incidents-state"
          className="p-8 text-center space-y-2 border-dashed border-slate-700"
        >
          <div className="text-sm font-mono font-bold text-slate-200">
            No incidents recorded for {selectedDmaId}
          </div>
          <p className="text-xs text-slate-400">
            Cross-DMA incident fallback is disabled. Select another DMA or trigger synthetic telemetry &amp; operational assessment above.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedIncidents.map((incident) => (
            <Card
              key={incident.incidentId}
              data-testid={`incident-card-${incident.incidentId}`}
              hoverable
              className="flex flex-col justify-between space-y-3 cursor-pointer"
              onClick={() => openModal(incident)}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-bold text-cyan-primary truncate">
                    {incident.incidentId}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-navy-950 border border-slate-700 text-slate-300">
                      v{incident.version}
                    </span>
                    <Badge
                      variant={
                        incident.state === 'VERIFIED' || incident.state === 'CLOSED'
                          ? 'nominal'
                          : incident.state === 'DETECTED'
                          ? 'critical'
                          : 'warning'
                      }
                      showDot
                    >
                      {incident.state}
                    </Badge>
                  </div>
                </div>
                <h4 className="text-xs font-semibold text-slate-100 mt-2 line-clamp-2">
                  {incident.title}
                </h4>
                <p className="text-[11px] font-mono text-slate-400 mt-1">
                  DMA: {incident.dmaId}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800 text-xs font-mono flex items-center justify-between text-slate-400">
                <span>
                  Loss: <strong className="text-rose-critical">{incident.estimatedLossM3h} m³/h</strong>
                </span>
                <span className="text-[10px] text-cyan-primary hover:underline">Manage →</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Persisted Audit Log Trail */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="text-xs font-mono font-bold text-slate-200">
            Audit Trail ({runtimeMode === 'INTEGRATED_API' ? 'PostgreSQL audit_events' : 'RecordingAuditSink Demo Spy'})
          </span>
          <span className="text-[10px] font-mono text-slate-400">{auditLogs.length} events</span>
        </div>
        {auditLogs.length === 0 ? (
          <div className="text-xs font-mono text-slate-500 py-2">No audit events recorded yet.</div>
        ) : (
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto text-xs font-mono">
            {auditLogs.slice(0, 15).map((log) => (
              <div
                key={log.id}
                className="p-2 rounded bg-navy-950 border border-slate-800 flex flex-wrap items-start gap-2"
              >
                <span className="text-slate-500 text-[10px]">
                  {new Date(log.timestamp).toISOString().slice(11, 19)}Z
                </span>
                <span className="text-cyan-primary font-bold">[{log.eventType}]</span>
                {log.actorId && <span className="text-slate-400">({log.actorId})</span>}
                <span className="text-slate-300 flex-1">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {selectedIncident && (
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          title={`Work Order: ${selectedIncident.incidentId}`}
          subtitle={`DMA: ${selectedIncident.dmaId} · State: ${selectedIncident.state} · Version: v${selectedIncident.version}`}
          footer={
            <div className="flex items-center justify-between w-full gap-2">
              <Button size="sm" variant="ghost" onClick={closeModal}>
                Close
              </Button>
              {selectedIncident.state !== 'CLOSED' && (
                <Button
                  size="sm"
                  variant="primary"
                  data-testid="modal-advance-btn"
                  isLoading={isSubmitting}
                  onClick={handleAdvance}
                  rightIcon={<Icon name="check" size={14} />}
                >
                  {selectedIncident.state === 'DETECTED'
                    ? 'Assign Crew (DETECTED → ASSIGNED)'
                    : selectedIncident.state === 'ASSIGNED'
                    ? 'Start Repair (ASSIGNED → IN_REPAIR)'
                    : selectedIncident.state === 'IN_REPAIR'
                    ? 'Record Repair Evidence (→ REPAIRED)'
                    : selectedIncident.state === 'REPAIRED'
                    ? 'Evaluate Verification Evidence'
                    : 'Close Work Order (→ CLOSED)'}
                </Button>
              )}
            </div>
          }
        >
          <div className="space-y-4 text-xs font-mono">
            {actionError && (
              <div
                role="alert"
                data-testid="modal-action-error"
                className="p-2.5 rounded bg-rose-critical/20 text-rose-critical border border-rose-critical/40"
              >
                {actionError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-navy-950 border border-slate-800">
              <div>
                <span className="text-slate-500 block">Estimated excess flow:</span>
                <span className="text-rose-critical font-bold text-sm">
                  {selectedIncident.estimatedLossM3h} m³/h
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Version / Detected:</span>
                <span className="text-slate-200">
                  v{selectedIncident.version} · {new Date(selectedIncident.detectedAt).toISOString().slice(0, 19)}Z
                </span>
              </div>
            </div>

            {/* Verification Evidence Form when in REPAIRED state */}
            {selectedIncident.state === 'REPAIRED' && (
              <div className="space-y-2 p-3 rounded-lg bg-navy-950 border border-cyan-primary/30">
                <div className="font-bold text-cyan-primary">
                  Post-Repair Verification Evidence (Verdict computed server-side)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-slate-400 text-[10px]">Post-repair MNF (m³/h)</span>
                    <input
                      data-testid="verify-post-mnf-input"
                      type="number"
                      step="0.1"
                      value={postRepairMnfInput}
                      onChange={(e) => setPostRepairMnfInput(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 rounded bg-navy-900 border border-slate-700 text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-slate-400 text-[10px]">Post-repair Pressure (bar)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={postRepairPressureInput}
                      onChange={(e) => setPostRepairPressureInput(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 rounded bg-navy-900 border border-slate-700 text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-slate-400 text-[10px]">Coverage Ratio (0..1)</span>
                    <input
                      type="number"
                      step="0.05"
                      value={postRepairCoverageInput}
                      onChange={(e) => setPostRepairCoverageInput(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 rounded bg-navy-900 border border-slate-700 text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-slate-400 text-[10px]">Sample Count</span>
                    <input
                      type="number"
                      value={postRepairSamplesInput}
                      onChange={(e) => setPostRepairSamplesInput(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 rounded bg-navy-900 border border-slate-700 text-slate-100"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPostRepairMnfInput('26.0');
                      setPostRepairCoverageInput('0.95');
                      setPostRepairSamplesInput('16');
                    }}
                    className="px-2 py-0.5 rounded bg-emerald-brand/15 text-emerald-brand text-[10px]"
                  >
                    Preset: Restored (26 m³/h)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPostRepairMnfInput('62.0');
                      setPostRepairCoverageInput('0.95');
                      setPostRepairSamplesInput('16');
                    }}
                    className="px-2 py-0.5 rounded bg-rose-critical/15 text-rose-critical text-[10px]"
                  >
                    Preset: Unresolved Rework (62 m³/h)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPostRepairMnfInput('26.0');
                      setPostRepairCoverageInput('0.30');
                      setPostRepairSamplesInput('3');
                    }}
                    className="px-2 py-0.5 rounded bg-amber-warning/15 text-amber-warning text-[10px]"
                  >
                    Preset: Insufficient Coverage
                  </button>
                </div>
              </div>
            )}

            {selectedIncident.crewAssignment && (
              <div className="p-3 rounded-lg bg-navy-950 border border-slate-800 space-y-1">
                <span className="text-cyan-primary font-bold block">Assigned Crew:</span>
                <div className="text-slate-200">{selectedIncident.crewAssignment.crewName}</div>
                <div className="text-slate-400">
                  {selectedIncident.crewAssignment.role} · ETA {selectedIncident.crewAssignment.etaMinutes} min
                </div>
              </div>
            )}

            {selectedIncident.repairEvidence && (
              <div className="p-3 rounded-lg bg-navy-950 border border-slate-800 space-y-1">
                <span className="text-cyan-primary font-bold block">Repair Evidence:</span>
                <div>{selectedIncident.repairEvidence.repairMethod}</div>
                <div className="text-slate-400">Ref: {selectedIncident.repairEvidence.photoFixtureRef}</div>
              </div>
            )}

            {selectedIncident.verificationResult && (
              <div className="p-3 rounded-lg bg-navy-950 border border-emerald-brand/30 space-y-1">
                <span className="text-emerald-brand font-bold block">
                  Verification Outcome: {selectedIncident.verificationResult.outcome}
                </span>
                <div>{selectedIncident.verificationResult.reason}</div>
                <div className="text-[10px] text-slate-400">
                  {selectedIncident.verificationResult.policyLabel}
                </div>
              </div>
            )}

            {incidentAudits.length > 0 && (
              <div className="p-3 rounded-lg bg-navy-950 border border-slate-800 space-y-1">
                <span className="text-slate-400 font-bold block">Incident Audit History:</span>
                {incidentAudits.slice(0, 6).map((a) => (
                  <div key={a.id} className="text-[11px] text-slate-300">
                    [{a.eventType}] {a.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
