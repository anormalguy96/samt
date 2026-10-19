import React from 'react';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { Icon } from '../atoms/Icon';
import { ClockSeamWidget } from '../molecules/ClockSeamWidget';
import { useDomain } from '../../context/DomainContext';

export const TestabilityHarness: React.FC = () => {
  const {
    simulatedHour,
    isNocturnal,
    jumpToNight,
    resetRealtime,
    setSimulatedHour,
    hasBurstAnomaly,
    hasTankRefill,
    hasCorruptedPacket,
    toggleBurstAnomaly,
    toggleTankRefill,
    toggleCorruptedPacket,
    auditLogs,
  } = useDomain();

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <Icon name="clock" size={16} className="text-cyan-primary" />
            Test edilə bilənlik və idarə olunan zaman seam-i (IClock)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Mühazirə 5: İdarəolunma (Controllability) və Müşahidəolunma (Observability) üçün deterministik zaman və xəta inyeksiyası
          </p>
        </div>

        <Badge variant={isNocturnal ? 'info' : 'nominal'} showDot>
          {isNocturnal ? 'Gecə rejimi aktivdir [02:00, 04:00)' : 'Gündüz real vaxt rejimi'}
        </Badge>
      </Card>

      {/* Clock Seam Widget */}
      <ClockSeamWidget
        simulatedHour={simulatedHour}
        isNocturnal={isNocturnal}
        onJumpToNight={jumpToNight}
        onResetRealtime={resetRealtime}
        onSetHour={setSimulatedHour}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Synthetic Fault Injection Suite */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-bold text-cyan-primary">
              Sintetik qəza və anomaliya generatoru (Boru kəmərinə təsir edir)
            </span>
            <Badge variant="warning">Aktiv idarəetmə</Badge>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-navy-900 border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-100 block">
                  Torricelli boru qəzası anomaliyası
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Cd = 0.62, A = 20 sm², H = 45 m · +38.4 m³/h sıçrayışı telemetriyaya ötürülür
                </span>
              </div>
              <Button
                size="sm"
                variant={hasBurstAnomaly ? 'danger' : 'outline'}
                onClick={() => toggleBurstAnomaly(!hasBurstAnomaly)}
              >
                {hasBurstAnomaly ? 'Söndür' : 'İnyeksiya et'}
              </Button>
            </div>

            <div className="p-3 rounded-lg bg-navy-900 border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-100 block">
                  Dam çənlərinin dolma dalğası (üzgəc klapan)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  02:00–04:00 pəncərəsində dövri +18 m³/h gecə pulsasiyası
                </span>
              </div>
              <Button
                size="sm"
                variant={hasTankRefill ? 'secondary' : 'outline'}
                onClick={() => toggleTankRefill(!hasTankRefill)}
              >
                {hasTankRefill ? 'Söndür' : 'İnyeksiya et'}
              </Button>
            </div>

            <div className="p-3 rounded-lg bg-navy-900 border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-100 block">
                  Zədələnmiş telemetriya paketi (CRC xətası / Skew)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Giriş şlüzünün qoruyucu şərtləri paketi karantinə (QUARANTINED) yönləndirir
                </span>
              </div>
              <Button
                size="sm"
                variant={hasCorruptedPacket ? 'danger' : 'outline'}
                onClick={() => toggleCorruptedPacket(!hasCorruptedPacket)}
              >
                {hasCorruptedPacket ? 'Söndür' : 'İnyeksiya et'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Fault Injection Terminal Logs */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
            <span className="text-xs font-mono font-bold text-slate-200">
              Test mühitinin telemetriya jurnalı (RecordingAuditSink Spy)
            </span>
            <span className="text-[10px] font-mono text-cyan-primary">IClock sinxron</span>
          </div>

          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 text-xs font-mono bg-navy-950 p-3 rounded-lg border border-slate-800 flex-1">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2">
                <span className="text-slate-500 text-[10px]">
                  {new Date(log.timestamp).toLocaleTimeString('az-AZ')}
                </span>
                <span
                  className={
                    log.severity === 'ERROR'
                      ? 'text-rose-critical'
                      : log.severity === 'WARN'
                      ? 'text-amber-warning'
                      : 'text-cyan-primary'
                  }
                >
                  [{log.severity}]
                </span>
                <span className="text-slate-300 flex-1">{log.message}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
