import React from 'react';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { Icon } from '../atoms/Icon';
import { ClockSeamWidget } from '../molecules/ClockSeamWidget';
import { useDomain } from '../../context/DomainContext';

export const TestabilityHarness: React.FC = () => {
  const {
    runtimeMode,
    simulatedHour,
    isNocturnal,
    jumpToNight,
    resetRealtime,
    setSimulatedHour,
    hasBurstAnomaly,
    hasTankRefill,
    hasCorruptedPacket,
    lastCorruptedValidationMessage,
    toggleBurstAnomaly,
    toggleTankRefill,
    toggleCorruptedPacket,
    auditLogs,
  } = useDomain();

  const isDemo = runtimeMode === 'STATIC_DEMO';

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <Icon name="clock" size={16} className="text-cyan-primary" />
            Testability Seam &amp; Injectable Clock (Demo / Test Sandbox)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Lecture 5: Deterministic time control and fault injection run strictly in Static Demo / Test Mode. Ordinary clients cannot mutate server authoritative time.
          </p>
        </div>

        <Badge variant={isDemo ? (isNocturnal ? 'info' : 'nominal') : 'warning'} showDot>
          {isDemo
            ? isNocturnal
              ? 'Demo Night Window Active [02:00, 04:00) AZT'
              : 'Demo Daytime Mode'
            : 'Integrated Mode: Server Clock Authoritative'}
        </Badge>
      </Card>

      {!isDemo && (
        <div className="p-3 rounded-xl bg-navy-900 border border-cyan-primary/30 text-xs font-mono text-slate-300">
          Integrated API Mode is active: the server owns <code className="text-cyan-primary">received_at</code> and rejects unauthorized clock manipulation. Switch to <strong>Static Demo / Test Mode</strong> in the header to exercise the local <code className="text-cyan-primary">FixedClock</code> seam.
        </div>
      )}

      {isDemo && (
        <ClockSeamWidget
          simulatedHour={simulatedHour}
          isNocturnal={isNocturnal}
          onJumpToNight={jumpToNight}
          onResetRealtime={resetRealtime}
          onSetHour={setSimulatedHour}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-bold text-cyan-primary">
              Synthetic Fault Injection Controls (Demo Pipeline)
            </span>
            <Badge variant={isDemo ? 'warning' : 'neutral'}>
              {isDemo ? 'Demo Active' : 'Read-Only in Integrated Mode'}
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-navy-900 border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-100 block">
                  Synthetic Burst Transient (+38.4 m³/h Demo Input)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Independent synthetic burst amplitude (+38.4 m³/h). Note: Torricelli orifice Cd=0.62, A=20 cm², H=45 m yields ≈ 132.64 m³/h.
                </span>
              </div>
              <Button
                size="sm"
                disabled={!isDemo}
                variant={hasBurstAnomaly ? 'danger' : 'outline'}
                onClick={() => toggleBurstAnomaly(!hasBurstAnomaly)}
              >
                {hasBurstAnomaly ? 'Disable' : 'Inject'}
              </Button>
            </div>

            <div className="p-3 rounded-lg bg-navy-900 border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-100 block">
                  Synthetic Rooftop Tank Refill Pattern
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Adds periodic +18 m³/h synthetic diurnal curve component during [02:00, 04:00) AZT
                </span>
              </div>
              <Button
                size="sm"
                disabled={!isDemo}
                variant={hasTankRefill ? 'secondary' : 'outline'}
                onClick={() => toggleTankRefill(!hasTankRefill)}
              >
                {hasTankRefill ? 'Disable' : 'Inject'}
              </Button>
            </div>

            <div className="p-3 rounded-lg bg-navy-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-slate-100 block">
                    Future-Skewed Telemetry Packet (+45 min Clock Skew)
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    Exercises the real TelemetryValidator DbC guard (returns QUARANTINED)
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={!isDemo}
                  variant={hasCorruptedPacket ? 'danger' : 'outline'}
                  onClick={() => toggleCorruptedPacket(!hasCorruptedPacket)}
                >
                  {hasCorruptedPacket ? 'Clear' : 'Validate Fault'}
                </Button>
              </div>
              {lastCorruptedValidationMessage && (
                <div className="p-2 rounded bg-rose-critical/10 border border-rose-critical/30 text-[11px] font-mono text-rose-critical">
                  Observed validator result: {lastCorruptedValidationMessage}
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
            <span className="text-xs font-mono font-bold text-slate-200">
              Observed Audit Log ({isDemo ? 'RecordingAuditSink Spy' : 'PostgreSQL audit_events'})
            </span>
            <span className="text-[10px] font-mono text-cyan-primary">Observed effects only</span>
          </div>

          <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1 text-xs font-mono bg-navy-950 p-3 rounded-lg border border-slate-800 flex-1">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2">
                <span className="text-slate-500 text-[10px]">
                  {new Date(log.timestamp).toISOString().slice(11, 19)}Z
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
