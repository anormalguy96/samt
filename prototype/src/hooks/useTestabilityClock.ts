import { useState, useCallback } from 'react';
import type { AuditLogEntry } from '../types';

export function useTestabilityClock() {
  const [simulatedHour, setSimulatedHour] = useState<number>(14);
  const [faultLogs, setFaultLogs] = useState<AuditLogEntry[]>([
    {
      id: 'fault-init',
      timestamp: '14:00:00',
      level: 'INFO',
      message: 'Test Seam Harness active. Controllable IClock running at hour 14:00.',
    },
  ]);

  const isNocturnal = simulatedHour >= 2 && simulatedHour <= 4;

  const jumpToNight = useCallback(() => {
    setSimulatedHour(3);
    const log: AuditLogEntry = {
      id: `fault-${Date.now()}`,
      timestamp: '03:00:00',
      level: 'INFO',
      message: 'Time-Travel Event: Clock seam jumped to 03:00 AZT. Nocturnal MNF baseline analysis triggered deterministically.',
    };
    setFaultLogs((prev) => [log, ...prev]);
  }, []);

  const resetRealtime = useCallback(() => {
    setSimulatedHour(14);
    const log: AuditLogEntry = {
      id: `fault-${Date.now()}`,
      timestamp: '14:00:00',
      level: 'INFO',
      message: 'Time-Travel Event: Clock seam returned to real-time nominal daytime window (14:00 AZT).',
    };
    setFaultLogs((prev) => [log, ...prev]);
  }, []);

  const injectBurstAnomaly = useCallback(() => {
    const log: AuditLogEntry = {
      id: `fault-${Date.now()}`,
      timestamp: `${String(simulatedHour).padStart(2, '0')}:12:44`,
      level: 'ERROR',
      message: 'Fault Injection: Torricelli Sudden Burst (Cd=0.62, A=20cm2, H=45m) -> +38.4 m3/h spike and -0.7 bar wavefront injected into DMA-YASAMAL-04.',
    };
    setFaultLogs((prev) => [log, ...prev]);
  }, [simulatedHour]);

  const injectTankRefill = useCallback(() => {
    const log: AuditLogEntry = {
      id: `fault-${Date.now()}`,
      timestamp: `${String(simulatedHour).padStart(2, '0')}:15:10`,
      level: 'WARN',
      message: 'Fault Injection: Rooftop Tank Float-Valve Chattering -> Periodic +18 m3/h pulse injected. Flink decomposition filter confirmed removal.',
    };
    setFaultLogs((prev) => [log, ...prev]);
  }, [simulatedHour]);

  const injectCorruptedPacket = useCallback(() => {
    const log: AuditLogEntry = {
      id: `fault-${Date.now()}`,
      timestamp: `${String(simulatedHour).padStart(2, '0')}:18:02`,
      level: 'ERROR',
      message: 'Fault Injection: Corrupted CRC-32 Telemetry Packet -> Ingestion Gateway rejected payload and placed in Quarantine DLQ.',
    };
    setFaultLogs((prev) => [log, ...prev]);
  }, [simulatedHour]);

  return {
    simulatedHour,
    isNocturnal,
    faultLogs,
    setSimulatedHour,
    jumpToNight,
    resetRealtime,
    injectBurstAnomaly,
    injectTankRefill,
    injectCorruptedPacket,
  };
}
