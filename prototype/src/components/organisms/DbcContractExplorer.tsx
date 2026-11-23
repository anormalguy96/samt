import React, { useState, useMemo } from 'react';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { Slider } from '../atoms/Slider';
import { Toggle } from '../atoms/Toggle';
import { Icon } from '../atoms/Icon';
import { DbcControlRow } from '../molecules/DbcControlRow';
import { FixedClock } from '../../domain/ports/Clock';
import { StandardMeterRegistry } from '../../domain/adapters/StandardMeterRegistry';
import { TelemetryValidator } from '../../domain/telemetry/validation';
import type { TelemetryObservation } from '../../domain/ports/TelemetryPort';

export const DbcContractExplorer: React.FC = () => {
  const [clockDriftMin, setClockDriftMin] = useState<number>(4);
  const [batteryVolts, setBatteryVolts] = useState<number>(3.4);
  const [mtlsValid, setMtlsValid] = useState<boolean>(true);
  const [flowRateM3h, setFlowRateM3h] = useState<number>(42.5);

  const [evaluationResult, setEvaluationResult] = useState<{
    status: 'IDLE' | 'SUCCESS' | 'BREACH' | 'QUARANTINE';
    message: string;
    preconditionsSatisfied: boolean;
  }>({
    status: 'IDLE',
    message: 'Müqavilə şərtlərini yoxlamaq üçün düyməni sıxın.',
    preconditionsSatisfied: true,
  });

  const [auditEntries, setAuditEntries] = useState<{ id: string; time: string; level: string; msg: string }[]>([
    {
      id: '1',
      time: '14:00:00',
      level: 'INFO',
      msg: 'DbC yoxlama mühərriki aktivdir: IIngestionGateway.submitTelemetry müqaviləsi izlənilir.',
    },
    {
      id: '2',
      time: '14:00:01',
      level: 'INFO',
      msg: 'Qaydalar: Saat sürüşməsi <= 15 dəq; Batareya >= 3.0V; Simulyasiya edilmiş X.509 = Etibarlı.',
    },
  ]);

  const clock = useMemo(() => new FixedClock('2026-10-20T14:00:00+04:00'), []);
  const registry = useMemo(() => new StandardMeterRegistry(), []);

  const handleVerify = () => {
    const validator = new TelemetryValidator(clock, registry, {
      maxClockDriftMinutes: 15,
      clientAuthenticated: mtlsValid,
      authenticatedDeviceId: 'GW-YAS-01',
    });

    const now = clock.now();
    const observedTime = new Date(now.getTime() + clockDriftMin * 60 * 1000);

    const testObservation: TelemetryObservation = {
      observationId: `OBS-${Date.now()}`,
      deviceId: 'GW-YAS-01',
      meterId: 'FM-YAS-INLET-01',
      dmaId: 'DMA-YASAMAL-04',
      metric: 'FLOW_M3H',
      canonicalUnit: 'm3/h',
      value: flowRateM3h,
      observedAt: observedTime,
      transmittedAt: now,
      receivedAt: now,
      quality: 'VALID',
      batteryVolts,
    };

    const res = validator.validate(testObservation);
    const timeStr = new Date().toLocaleTimeString('az-AZ');

    if (!res.accepted) {
      if (res.quality === 'QUARANTINED') {
        setEvaluationResult({
          status: 'QUARANTINE',
          message: `Karantin: ${res.reason}`,
          preconditionsSatisfied: false,
        });
        setAuditEntries((prev) => [
          { id: String(Date.now()), time: timeStr, level: 'WARN', msg: `Karantin (Precondition violation): ${res.reason}` },
          ...prev,
        ]);
      } else {
        setEvaluationResult({
          status: 'BREACH',
          message: `Müqavilə pozuntusu (requires): ${res.reason}`,
          preconditionsSatisfied: false,
        });
        setAuditEntries((prev) => [
          { id: String(Date.now()), time: timeStr, level: 'ERROR', msg: `Rədd edildi (Rejected): ${res.reason}` },
          ...prev,
        ]);
      }
    } else {
      setEvaluationResult({
        status: 'SUCCESS',
        message: `Müqavilə təmin edildi (200 OK): Bütün daxilolma şərtləri ödənildi. Qəbul keyfiyyəti: ${res.quality}`,
        preconditionsSatisfied: true,
      });
      setAuditEntries((prev) => [
        {
          id: String(Date.now()),
          time: timeStr,
          level: 'SUCCESS',
          msg: `Müqavilə ödənildi: Telemetriya qəbul edildi [Quality: ${res.quality}]. In-Memory Sink-ə yazıldı.`,
        },
        ...prev,
      ]);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <Icon name="terminal" size={16} className="text-cyan-primary" />
            Müqavilə əsaslı dizayn (DbC) test laboratoriyası
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Mühazirə 3: İnterfeys: <code className="text-cyan-primary">IIngestionGateway.submitTelemetry(TelemetryObservation)</code>
          </p>
        </div>

        <Button size="sm" variant="primary" onClick={handleVerify} rightIcon={<Icon name="check" size={14} />}>
          Müqavilə şərtlərini yoxla
        </Button>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Precondition Parameters */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-bold text-cyan-primary">
              1. Daxilolma şərtləri (preconditions / requires)
            </span>
            <Badge variant="info">DbC mühiti</Badge>
          </div>

          <DbcControlRow
            label="Zaman damğası sürüşməsi (clock drift)"
            contractRule="requires: |packet.timestamp - now()| <= 15 dəqiqə"
            status={Math.abs(clockDriftMin) <= 15 ? 'valid' : 'invalid'}
            statusText={Math.abs(clockDriftMin) <= 15 ? 'Şərt ödənir' : 'Pozuntu (>15 dəq)'}
          >
            <Slider
              label="Saat sürüşməsi"
              value={clockDriftMin}
              min={-30}
              max={30}
              step={1}
              unit="dəq"
              onChange={setClockDriftMin}
            />
          </DbcControlRow>

          <DbcControlRow
            label="IoT cihaz batareyasının gərginliyi"
            contractRule="requires: battery_volts >= 3.0V (aşağı olarsa SUSPECT keyfiyyəti)"
            status={batteryVolts >= 3.0 ? 'valid' : 'warning'}
            statusText={batteryVolts >= 3.0 ? 'Nominal (≥ 3.0V)' : 'Zəif batareya'}
          >
            <Slider
              label="Batareya səviyyəsi"
              value={batteryVolts}
              min={2.0}
              max={4.2}
              step={0.1}
              unit="V"
              onChange={(val) => setBatteryVolts(parseFloat(val.toFixed(1)))}
            />
          </DbcControlRow>

          <DbcControlRow
            label="Ölçülən axın sürəti (Q)"
            contractRule="requires: value >= 0 (mənfi axın fiziki olaraq rədd edilir)"
            status={flowRateM3h >= 0 ? 'valid' : 'invalid'}
            statusText={flowRateM3h >= 0 ? 'Qanuni (≥ 0)' : 'Mənfi axın'}
          >
            <Slider
              label="Axın sürəti"
              value={flowRateM3h}
              min={-20}
              max={100}
              step={1}
              unit="m³/h"
              onChange={(val) => setFlowRateM3h(val)}
            />
          </DbcControlRow>

          <DbcControlRow
            label="Cihazın mTLS X.509 sertifikatı"
            contractRule="requires: client_cert etibarlı olmalıdır (Simulyasiya edilmiş autentifikasiya)"
            status={mtlsValid ? 'valid' : 'invalid'}
            statusText={mtlsValid ? 'Etibarlıdır' : 'Yoxdur / Vaxtı bitib'}
          >
            <Toggle
              label="Simulyasiya edilmiş X.509 müştəri sertifikatı təqdim edilib"
              checked={mtlsValid}
              onChange={setMtlsValid}
            />
          </DbcControlRow>
        </Card>

        {/* Postcondition Console */}
        <Card className="flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-mono font-bold text-slate-200">
                2. Çıxış zəmanətləri (ensures)
              </span>
              <Badge
                variant={
                  evaluationResult.status === 'SUCCESS'
                    ? 'nominal'
                    : evaluationResult.status === 'BREACH'
                    ? 'critical'
                    : evaluationResult.status === 'QUARANTINE'
                    ? 'warning'
                    : 'neutral'
                }
                showDot
              >
                {evaluationResult.status === 'SUCCESS'
                  ? 'Uğurlu'
                  : evaluationResult.status === 'BREACH'
                  ? 'Pozuntu'
                  : evaluationResult.status === 'QUARANTINE'
                  ? 'Karantin'
                  : 'Gözləmədə'}
              </Badge>
            </div>

            <div
              className={`p-3 rounded-lg border text-xs font-mono leading-relaxed ${
                evaluationResult.status === 'SUCCESS'
                  ? 'bg-emerald-brand/10 border-emerald-brand/30 text-emerald-brand'
                  : evaluationResult.status === 'BREACH'
                  ? 'bg-rose-critical/10 border-rose-critical/30 text-rose-critical'
                  : evaluationResult.status === 'QUARANTINE'
                  ? 'bg-amber-warning/10 border-amber-warning/30 text-amber-warning'
                  : 'bg-navy-900 border-slate-800 text-slate-400'
              }`}
            >
              {evaluationResult.message}
            </div>

            <div className="space-y-1 text-xs font-mono text-slate-400 bg-navy-900/60 p-3 rounded-lg border border-slate-800/80">
              <span className="text-[11px] font-bold text-cyan-primary block">
                Sistem zəmanətləri (ensures və invariants):
              </span>
              <div>• Determinik telemetriya qəbulu və dublikat aşkarlanması</div>
              <div>• Giriş gecikməsi: &lt; 5 ms (In-Memory mühiti)</div>
              <div>• Qanuni qiymət: Q &gt;= 0, P &gt;= 0</div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 mb-2">Canlı audit jurnalı:</div>
            <div className="space-y-1.5 max-h-[130px] overflow-y-auto pr-1 text-xs font-mono bg-navy-950 p-2.5 rounded-lg border border-slate-800">
              {auditEntries.map((log) => (
                <div key={log.id} className="flex items-start gap-2">
                  <span className="text-slate-500 text-[10px]">{log.time}</span>
                  <span
                    className={
                      log.level === 'SUCCESS'
                        ? 'text-emerald-brand'
                        : log.level === 'ERROR'
                        ? 'text-rose-critical'
                        : log.level === 'WARN'
                        ? 'text-amber-warning'
                        : 'text-cyan-primary'
                    }
                  >
                    [{log.level}]
                  </span>
                  <span className="text-slate-300 flex-1">{log.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
