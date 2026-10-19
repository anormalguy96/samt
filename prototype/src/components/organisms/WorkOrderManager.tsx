import React, { useState } from 'react';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { Modal } from '../atoms/Modal';
import { Icon } from '../atoms/Icon';
import { useDomain } from '../../context/DomainContext';
import type { Incident } from '../../domain/ports/IncidentPort';

export const WorkOrderManager: React.FC = () => {
  const { incidents, dispatchIncidentEvent } = useDomain();
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const openModal = (incident: Incident) => {
    setSelectedIncident(incident);
    setActionError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleAdvance = async () => {
    if (!selectedIncident) return;
    setActionError(null);
    const id = selectedIncident.incidentId;

    if (selectedIncident.state === 'DETECTED') {
      const res = await dispatchIncidentEvent(id, {
        type: 'ASSIGN',
        crew: {
          crewId: 'CREW-01',
          crewName: 'Bakı Təcili Bərpa Briqadası #1',
          crewPhone: '+994 50 876-54-32',
          role: 'Briqadir: Rəşad Əliyev',
          etaMinutes: 20,
          assignedAt: new Date(),
        },
      });
      if (!res.success) setActionError(res.error || 'Xəta');
    } else if (selectedIncident.state === 'ASSIGNED') {
      const res = await dispatchIncidentEvent(id, {
        type: 'START_REPAIR',
        technicianId: 'TECH-RASHAD',
      });
      if (!res.success) setActionError(res.error || 'Xəta');
    } else if (selectedIncident.state === 'IN_REPAIR') {
      const res = await dispatchIncidentEvent(id, {
        type: 'RECORD_REPAIR_EVIDENCE',
        evidence: {
          technicianId: 'TECH-RASHAD',
          repairMethod: 'Polad Qaynaq Muftası Ø150mm',
          clampType: 'Duktil Klemma',
          photoFixtureRef: 'fixture://photos/wo-repair-complete.webp',
          completedAt: new Date(),
          technicianNotes: 'Sızma nöqtəsi bərpa olundu.',
        },
      });
      if (!res.success) setActionError(res.error || 'Xəta');
    } else if (selectedIncident.state === 'REPAIRED') {
      const res = await dispatchIncidentEvent(id, {
        type: 'EVALUATE_VERIFICATION',
        evaluation: {
          evaluatedAt: new Date(),
          preRepairMnfM3h: 55.0,
          postRepairMnfM3h: 24.5,
          baselineMnfM3h: 24.0,
          verifiedLossDropM3h: 30.5,
          isSuccessful: true,
          reason: 'Post-repair MNF restored to baseline envelope',
        },
      });
      if (!res.success) setActionError(res.error || 'Xəta');
    } else if (selectedIncident.state === 'VERIFIED') {
      const res = await dispatchIncidentEvent(id, {
        type: 'CLOSE',
        closedBy: 'ADSEA-DISPATCHER',
      });
      if (!res.success) setActionError(res.error || 'Xəta');
    }

    closeModal();
  };

  const activeCount = incidents.filter((i) => i.state !== 'CLOSED' && i.state !== 'FALSE_ALARM').length;
  const closedCount = incidents.filter((i) => i.state === 'CLOSED' || i.state === 'VERIFIED').length;

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <Icon name="alert" size={16} className="text-cyan-primary" />
            Sızma insidentləri və təmir iş əmrləri
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Sahə qəza-bərpa briqadaları üçün operativ iş əmrlərinin idarə edilməsi və təmir aktlarının qeydiyyatı
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="critical" showDot>
            {activeCount} aktiv insident
          </Badge>
          <Badge variant="nominal" showDot>
            {closedCount} təsdiqlənmiş/bağlanmış
          </Badge>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {incidents.map((incident) => (
          <Card
            key={incident.incidentId}
            hoverable
            className="flex flex-col justify-between space-y-3 cursor-pointer"
            onClick={() => openModal(incident)}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-cyan-primary">
                  {incident.incidentId}
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
              <h4 className="text-xs font-semibold text-slate-100 mt-2 line-clamp-1">
                {incident.title}
              </h4>
              <p className="text-[11px] font-mono text-slate-400 mt-1">
                Zona: {incident.dmaId}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-800 text-xs font-mono flex items-center justify-between text-slate-400">
              <span>İtki: <strong className="text-rose-critical">{incident.estimatedLossM3h} m³/h</strong></span>
              <span className="text-[10px] text-cyan-primary hover:underline">Detallara bax →</span>
            </div>
          </Card>
        ))}
      </div>

      {selectedIncident && (
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          title={`İş əmri: ${selectedIncident.incidentId}`}
          subtitle={`DMA: ${selectedIncident.dmaId} · Status: ${selectedIncident.state}`}
          footer={
            <div className="flex items-center justify-between w-full">
              <Button size="sm" variant="ghost" onClick={closeModal}>
                Bağla
              </Button>
              {selectedIncident.state !== 'CLOSED' && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleAdvance}
                  rightIcon={<Icon name="check" size={14} />}
                >
                  Növbəti mərhələyə keçir
                </Button>
              )}
            </div>
          }
        >
          <div className="space-y-4 text-xs font-mono">
            {actionError && (
              <div className="p-2 rounded bg-rose-critical/20 text-rose-critical border border-rose-critical/40">
                {actionError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-navy-950 border border-slate-800">
              <div>
                <span className="text-slate-500 block">Sızma itkisi:</span>
                <span className="text-rose-critical font-bold text-sm">
                  {selectedIncident.estimatedLossM3h} m³/h
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Qeydiyyat vaxtı:</span>
                <span className="text-slate-200">
                  {new Date(selectedIncident.detectedAt).toLocaleTimeString('az-AZ')}
                </span>
              </div>
            </div>

            <div className="space-y-2 p-3 rounded-lg bg-navy-950 border border-slate-800">
              <span className="text-slate-400 font-bold block text-cyan-primary">
                Təyin olunmuş sahə briqadası:
              </span>
              {selectedIncident.crewAssignment ? (
                <div>
                  <div className="text-slate-200 font-semibold">{selectedIncident.crewAssignment.crewName}</div>
                  <div className="text-slate-400">{selectedIncident.crewAssignment.role}</div>
                  <div className="text-emerald-brand">{selectedIncident.crewAssignment.crewPhone}</div>
                  <div className="text-slate-400 text-[11px] mt-1">ETA: {selectedIncident.crewAssignment.etaMinutes} dəq</div>
                </div>
              ) : (
                <div className="text-slate-500 italic">Briqada təyin edilməyib (İnsident aşkarlanma mərhələsindədir)</div>
              )}
            </div>

            <div className="space-y-2 p-3 rounded-lg bg-navy-950 border border-slate-800">
              <span className="text-slate-400 font-bold block text-cyan-primary">
                Təmir sübutları və təsdiq:
              </span>
              {selectedIncident.repairEvidence ? (
                <div className="space-y-1">
                  <div>Metod: {selectedIncident.repairEvidence.repairMethod}</div>
                  <div>Qeyd: {selectedIncident.repairEvidence.technicianNotes}</div>
                  <div className="text-slate-500 text-[10px]">
                    Foto sübut: {selectedIncident.repairEvidence.photoFixtureRef} (Sintetik fixture metadata)
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 italic">Təmir sübutu hələ təqdim edilməyib</div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
