import { useState, useCallback } from 'react';
import type { AuditLogEntry } from '../types';

export interface DbcInputs {
  clockDriftMin: number;
  batteryVolts: number;
  mtlsValid: boolean;
  flowRateM3h: number;
}

export function useDbcVerifier() {
  const [inputs, setInputs] = useState<DbcInputs>({
    clockDriftMin: 4,
    batteryVolts: 3.4,
    mtlsValid: true,
    flowRateM3h: 42.5,
  });

  const [evaluationResult, setEvaluationResult] = useState<{
    status: 'IDLE' | 'SUCCESS' | 'BREACH';
    message: string;
    preconditionsSatisfied: boolean;
  }>({
    status: 'IDLE',
    message: 'Müqavilə şərtlərini yoxlamaq üçün düyməni sıxın.',
    preconditionsSatisfied: true,
  });

  const [consoleLogs, setConsoleLogs] = useState<AuditLogEntry[]>([
    {
      id: 'dbc-init-1',
      timestamp: '14:00:00',
      level: 'INFO',
      message: 'DbC yoxlama mühərriki aktivdir: IIngestionGateway.submitTelemetry müqaviləsi izlənilir.',
    },
    {
      id: 'dbc-init-2',
      timestamp: '14:00:01',
      level: 'INFO',
      message: 'Qaydalar: Saat sürüşməsi <= 15 dəq; Batareya >= 3.0V; mTLS = Etibarlı.',
    },
  ]);

  const verifyContract = useCallback(() => {
    const isClockValid = Math.abs(inputs.clockDriftMin) <= 15;
    const isBatteryValid = inputs.batteryVolts >= 3.0;
    const isMtlsValid = inputs.mtlsValid;

    const timestamp = new Date().toLocaleTimeString('az-AZ');

    if (!isMtlsValid) {
      setEvaluationResult({
        status: 'BREACH',
        message: 'Müqavilə pozuntusu: mTLS müştəri sertifikatı etibarsızdır (Zone 2 DMZ paketi rədd etdi).',
        preconditionsSatisfied: false,
      });
      setConsoleLogs((prev) => [
        {
          id: `dbc-${Date.now()}`,
          timestamp,
          level: 'ERROR',
          message: 'Müqavilə pozuntusu (requires): mTLS sertifikatı tapılmadı və ya vaxtı bitib.',
        },
        ...prev,
      ]);
      return;
    }

    if (!isClockValid) {
      setEvaluationResult({
        status: 'BREACH',
        message: `Müqavilə pozuntusu: Saat sürüşməsi ${inputs.clockDriftMin} dəqiqədir (limit: ≤ 15 dəqiqə).`,
        preconditionsSatisfied: false,
      });
      setConsoleLogs((prev) => [
        {
          id: `dbc-${Date.now()}`,
          timestamp,
          level: 'ERROR',
          message: `Müqavilə pozuntusu (requires): Saat sürüşməsi |Δt| = ${inputs.clockDriftMin} dəqiqə > 15 dəqiqə.`,
        },
        ...prev,
      ]);
      return;
    }

    if (!isBatteryValid) {
      setEvaluationResult({
        status: 'BREACH',
        message: `Xəbərdarlıq: Batareya gərginliyi ${inputs.batteryVolts}V kritik həddədir (< 3.0V).`,
        preconditionsSatisfied: false,
      });
      setConsoleLogs((prev) => [
        {
          id: `dbc-${Date.now()}`,
          timestamp,
          level: 'WARN',
          message: `Xəbərdarlıq: Batareya gərginliyi ${inputs.batteryVolts}V zəifdir. Məlumat karantin bayrağı ilə qəbul edildi.`,
        },
        ...prev,
      ]);
      return;
    }

    setEvaluationResult({
      status: 'SUCCESS',
      message: 'Müqavilə təmin edildi (200 OK): Bütün daxilolma şərtləri və sistem invariantları ödənildi.',
      preconditionsSatisfied: true,
    });

    setConsoleLogs((prev) => [
      {
        id: `dbc-${Date.now()}`,
        timestamp,
        level: 'SUCCESS',
        message: `Müqavilə ödənildi (ensures): IngestionGateway -> Kafka [dma_partition_key] üzrə 18 ms-də qeydə alındı.`,
      },
      ...prev,
    ]);
  }, [inputs]);

  return {
    inputs,
    setInputs,
    evaluationResult,
    consoleLogs,
    verifyContract,
  };
}
