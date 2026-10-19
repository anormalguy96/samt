import { useState, useEffect } from 'react';

export interface TelemetryMetrics {
  packetRate: number;
  totalInflowM3h: number;
  nrwPercentage: number;
  activeAnomalies: number;
  activeDmas: number;
  lastUpdated: string;
  cloudZone: string;
}

export function useTelemetryStream() {
  const [metrics, setMetrics] = useState<TelemetryMetrics>({
    packetRate: 40280,
    totalInflowM3h: 38450,
    nrwPercentage: 28.4,
    activeAnomalies: 3,
    activeDmas: 150,
    lastUpdated: new Date().toLocaleTimeString('az-AZ'),
    cloudZone: 'Zone 3 Core (AzInTelecom)',
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setMetrics((prev) => {
        const jitter = Math.floor(Math.random() * 41) - 20;
        const newRate = Math.min(42000, Math.max(38000, prev.packetRate + jitter));
        return {
          ...prev,
          packetRate: newRate,
          lastUpdated: new Date().toLocaleTimeString('az-AZ'),
        };
      });
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  return metrics;
}
