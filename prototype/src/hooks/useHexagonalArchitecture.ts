import { useState } from 'react';

export type DbAdapterType = 'TIMESCALE_POSTGIS' | 'IN_MEMORY_STUB';

export interface ParnasSecret {
  id: string;
  secretTitle: string;
  description: string;
  hiddenMechanism: string;
  stablePort: string;
}

export function useHexagonalArchitecture() {
  const [activeDbAdapter, setActiveDbAdapter] = useState<DbAdapterType>('TIMESCALE_POSTGIS');

  const parnasSecrets: ParnasSecret[] = [
    {
      id: 'secret-1',
      secretTitle: 'Gizlədilən Sirr 1: Sayğac Rabitə Protokolları & Avadanlıq Fərqləri',
      description: 'Müxtəlif istehsalçıların (Kamstrup, Diehl, Sensus) fiziki rabitə formatları (Modbus RTU, M-Bus, LoRaWAN payload formatı).',
      hiddenMechanism: 'Zone 2 DMZ Rust Ingestion Adapteri daxilində deserializasiya olunur.',
      stablePort: 'Port: ITelemetryIngestionPort (Protobuf v3 Domain Model)',
    },
    {
      id: 'secret-2',
      secretTitle: 'Gizlədilən Sirr 2: Fiziki Məlumat Bazası və Saxlama Dialekti',
      description: 'SQL cədvəl strukturu, TimescaleDB hypertable continuous aggregate və PostGIS ST_DWithin indekslərinin fiziki realizasiyası.',
      hiddenMechanism: 'TimescaleDbBalanceRepository adapteri daxilində SQL/DDL mühərrikinə təcrid edilib.',
      stablePort: 'Port: IWaterBalanceRepositoryPort (Domen Entity-ləri qaytarır)',
    },
    {
      id: 'secret-3',
      secretTitle: 'Gizlədilən Sirr 3: Su Paylanması Optimallaşdırma Alqoritmi',
      description: 'Xətti proqramlaşdırma (Simplex alqoritmi), qradiyent enmə və ya evristik regional bölgü texnikaları.',
      hiddenMechanism: 'Python Google OR-Tools mikroservis adapteri daxilində həll edilir.',
      stablePort: 'Port: IAllocationSolverPort (Domen bölgü tələbini alır)',
    },
  ];

  return {
    activeDbAdapter,
    setActiveDbAdapter,
    parnasSecrets,
  };
}
