/**
 * Operational Status Summary Hook (SAMT v1.1.0)
 * Replaces fabricated 40,280 pkt/s random jitter with honest runtime metrics derived from
 * either the live local PostgreSQL API or explicitly labeled Static Demo mode.
 */

import type { ApiBalanceResponse } from '../services/apiClient';
import type { ApiRuntimeStatus, RuntimeMode } from '../context/DomainContext';

export interface TelemetryMetrics {
  observedSamplesInWindow: number;
  totalInflowM3: number;
  residualPct: number;
  activeDmas: number;
  environmentLabel: string;
}

export function useTelemetryStream(options: {
  runtimeMode: RuntimeMode;
  apiStatus: ApiRuntimeStatus;
  balance: ApiBalanceResponse | null;
  dmaCount: number;
  demoSampleCount: number;
}): TelemetryMetrics {
  if (options.runtimeMode === 'INTEGRATED_API') {
    const totalSamples = options.balance
      ? options.balance.per_meter_integrations.reduce((acc, m) => acc + m.sample_count, 0)
      : 0;
    return {
      observedSamplesInWindow: totalSamples,
      totalInflowM3: options.balance ? options.balance.total_inflow_m3 : 0,
      residualPct: options.balance
        ? Number((options.balance.unexplained_residual_fraction * 100).toFixed(1))
        : 0,
      activeDmas: options.dmaCount,
      environmentLabel:
        options.apiStatus === 'READY'
          ? 'Local API + PostgreSQL 16'
          : options.apiStatus === 'UNAVAILABLE'
          ? 'API / PostgreSQL Unavailable (503)'
          : 'Connecting to Local API...',
    };
  }

  return {
    observedSamplesInWindow: options.demoSampleCount,
    totalInflowM3: 0,
    residualPct: 0,
    activeDmas: 4,
    environmentLabel: 'Static Demo Mode (Browser Only)',
  };
}
