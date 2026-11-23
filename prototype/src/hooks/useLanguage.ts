import { useState, useCallback } from 'react';
import type { Language } from '../types';

const dictionary: Record<Language, Record<string, string>> = {
  az: {
    // Header & Brand
    'system-title': 'SAMT v1.1.0',
    'system-sub': 'Su əməliyyatlarının mərkəzləşdirilmiş təhlili',
    'sovereign-tag': 'SAMT v1.1.0 · YERLİ PROTOTİP (NODE/TS + POSTGRESQL 16)',
    'cloud-zone': 'Yerli API + PostgreSQL 16',
    'mode-integrated': 'İnteqrasiya (API + PostgreSQL)',
    'mode-demo': 'Statik Demo / Test Rejimi',
    'role-dispatcher': 'Dispetçer',
    'role-viewer': 'Müşahidəçi (Yalnız oxu)',
    'samples-label': 'Pəncərə nümunələri',

    // KPI Cards
    'kpi-inflow-title': 'Seçilmiş DMA giriş həcmi',
    'kpi-inflow-sub': 'Sayğac üzrə trapesiya inteqrasiyası',
    'kpi-inflow-badge': 'Ölçülən / Sintetik',
    'kpi-nrw-title': 'İzah olunmayan qalıq (%)',
    'kpi-nrw-sub': 'İmzalı kütlə balansı qalığı',
    'kpi-nrw-badge': 'Sübut tələb edir',
    'kpi-anomalies-title': 'Aktiv insidentlər',
    'kpi-anomalies-sub': 'Persisted FSM vəziyyəti',
    'kpi-anomalies-badge': 'Əməliyyat nəzarəti',
    'kpi-active-title': 'Konfiqurasiya edilmiş DMA-lar',
    'kpi-active-sub': 'Yasamal (Əsas) + Nəsimi (İzolyasiya)',
    'kpi-active-badge': 'Sintetik pilot',

    // Tabs
    'tab-gis': 'Fiziki GIS şəbəkəsi',
    'tab-balance': 'Su balansı və MNF',
    'tab-c4': 'C4 memarlığı və FSM',
    'tab-dbc': 'DbC müqavilə testi',
    'tab-hexagonal': 'Heksaqonal və Parnas',
    'tab-testability': 'Test mühiti və zaman',
    'tab-workorders': 'Qəza iş əmrləri',
    'tab-allocation': 'Ədalətli su paylanması',
    'tab-opendata': 'İllüstrativ qənaət',

    // Workflow & Status States
    'status-detected': 'Aşkarlanıb',
    'status-assigned': 'Briqada təyin edilib',
    'status-in-repair': 'Təmirdədir',
    'status-repaired': 'Təmir tamamlandı',
    'status-verified': 'Təsdiqləndi',
    'status-closed': 'Bağlandı',
    'status-false-alarm': 'Yalançı həyəcan',
    'btn-close': 'Bağla',
    'btn-save': 'Yadda saxla',
    'btn-next-step': 'Növbəti mərhələ',
    'btn-reset': 'Sıfırla',
    'btn-calculate': 'Hesabla',
    'btn-refresh': 'Yenilə',
    'btn-retry': 'Yenidən yoxla',
    'state-loading': 'Yüklənir...',
    'state-empty-dma': 'Seçilmiş DMA üçün heç bir insident qeydə alınmayıb.',
    'state-unavailable': 'PostgreSQL API əlçatan deyil (503). Demo məlumatlara səssiz keçid edilmir.',
    'state-conflict': 'Versiya ziddiyyəti (HTTP 409): İnsident başqa operator tərəfindən yenilənib. Zəhmət olmasa son vəziyyəti yeniləyin.',
    'state-forbidden': 'İcazə rədd edildi (HTTP 403): Müşahidəçi rolu dəyişiklik edə bilməz.',
    'state-demo-notice': 'Statik Demo / Test rejimi: Saat və adapter dəyişdirmə yalnız brauzer daxilində təcrid olunmuş saxlama mühitində işləyir və məlumat köçürmür.',
  },
  en: {
    // Header & Brand
    'system-title': 'SAMT v1.1.0',
    'system-sub': 'Centralized Water Operations Analytics',
    'sovereign-tag': 'SAMT v1.1.0 · LOCAL PROTOTYPE (NODE/TS + POSTGRESQL 16)',
    'cloud-zone': 'Local API + PostgreSQL 16',
    'mode-integrated': 'Integrated (API + PostgreSQL)',
    'mode-demo': 'Static Demo / Test Mode',
    'role-dispatcher': 'Dispatcher',
    'role-viewer': 'Viewer (Read-only)',
    'samples-label': 'Window samples',

    // KPI Cards
    'kpi-inflow-title': 'Selected DMA Inflow Volume',
    'kpi-inflow-sub': 'Per-meter trapezoidal integration',
    'kpi-inflow-badge': 'Measured / Synthetic',
    'kpi-nrw-title': 'Unexplained Residual (%)',
    'kpi-nrw-sub': 'Signed boundary balance residual',
    'kpi-nrw-badge': 'Requires evidence',
    'kpi-anomalies-title': 'Active Incidents',
    'kpi-anomalies-sub': 'Persisted FSM lifecycle state',
    'kpi-anomalies-badge': 'Operational queue',
    'kpi-active-title': 'Configured DMAs',
    'kpi-active-sub': 'Yasamal (Primary) + Nasimi (Isolation)',
    'kpi-active-badge': 'Synthetic pilot',

    // Tabs
    'tab-gis': 'Physical GIS Network',
    'tab-balance': 'Water Balance & MNF',
    'tab-c4': 'C4 Architecture & FSM',
    'tab-dbc': 'DbC Contract Sandbox',
    'tab-hexagonal': 'Hexagonal & Parnas',
    'tab-testability': 'Test Seam & Clock',
    'tab-workorders': 'Incident Work Orders',
    'tab-allocation': 'Fair Water Allocation',
    'tab-opendata': 'Illustrative Savings',

    // Workflow & Status States
    'status-detected': 'Detected',
    'status-assigned': 'Assigned',
    'status-in-repair': 'In Repair',
    'status-repaired': 'Repaired',
    'status-verified': 'Verified',
    'status-closed': 'Closed',
    'status-false-alarm': 'False Alarm',
    'btn-close': 'Close',
    'btn-save': 'Save',
    'btn-next-step': 'Next Step',
    'btn-reset': 'Reset',
    'btn-calculate': 'Calculate',
    'btn-refresh': 'Refresh',
    'btn-retry': 'Retry',
    'state-loading': 'Loading...',
    'state-empty-dma': 'No incidents recorded for the selected DMA.',
    'state-unavailable': 'PostgreSQL HTTP API unavailable (503). Static demo fallback is intentionally disabled.',
    'state-conflict': 'Version conflict (HTTP 409): Incident was modified concurrently. Refresh latest state before retrying.',
    'state-forbidden': 'Forbidden (HTTP 403): Viewer role cannot mutate operational state.',
    'state-demo-notice': 'Static Demo / Test Mode: Clock travel, fault injection, and isolated adapter switching run strictly in-browser and do not migrate data.',
  },
};

export function useLanguage() {
  const [lang, setLang] = useState<Language>('en');

  const t = useCallback(
    (key: string): string => {
      return dictionary[lang][key] || key;
    },
    [lang]
  );

  return {
    lang,
    setLang,
    t,
  };
}
