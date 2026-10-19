import { useState, useCallback } from 'react';
import type { Language } from '../types';

const dictionary: Record<Language, Record<string, string>> = {
  az: {
    // Header & Brand
    'system-title': 'SAMT v1.0.1',
    'system-sub': 'Su əməliyyatlarının mərkəzləşdirilmiş təhlili',
    'sovereign-tag': 'AZƏRBAYCAN DÖVLƏT SU EHTİYATLARI AGENTLİYİ (ADSEA) · HÖKUMƏT BULUDU',
    'cloud-zone': 'Zona 3 Nüvə (AzInTelecom)',

    // KPI Cards
    'kpi-inflow-title': 'Şəbəkəyə ümumi daxilolma',
    'kpi-inflow-sub': 'Ceyranbatan + Şəmkir + Taxtakörpü',
    'kpi-inflow-badge': 'Sintetik axın',
    'kpi-nrw-title': 'Fiziki itki dərəcəsi (NRW)',
    'kpi-nrw-sub': '15 dəqiqəlik kütlə balansı',
    'kpi-nrw-badge': 'Hədəf: < 20%',
    'kpi-anomalies-title': 'Aktiv sızma ocaqları',
    'kpi-anomalies-sub': 'Təzyiq dalğası və gecə axını',
    'kpi-anomalies-badge': 'Təcili təmir',
    'kpi-active-title': 'Aktiv pilot DMA zonaları',
    'kpi-active-sub': 'Bakı, Abşeron, Gəncə, Şirvan',
    'kpi-active-badge': 'Pilot telemetriya',

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

    // Generic Common Terms
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
  },
  en: {
    // Header & Brand
    'system-title': 'SAMT v1.0.1',
    'system-sub': 'Centralized Water Operations Analytics',
    'sovereign-tag': 'AZERBAIJAN STATE WATER RESOURCES AGENCY (ADSEA) · SOVEREIGN CLOUD',
    'cloud-zone': 'Zone 3 Core (AzInTelecom)',

    // KPI Cards
    'kpi-inflow-title': 'Total Network Inflow',
    'kpi-inflow-sub': 'Jeyranbatan + Shamkir + Takhtakorpu',
    'kpi-inflow-badge': 'Simulated stream',
    'kpi-nrw-title': 'Physical Loss Rate (NRW)',
    'kpi-nrw-sub': '15-min hydraulic mass balance',
    'kpi-nrw-badge': 'Target: < 20%',
    'kpi-anomalies-title': 'Active Leak Anomalies',
    'kpi-anomalies-sub': 'Pressure transients + MNF analytics',
    'kpi-anomalies-badge': 'Urgent repair',
    'kpi-active-title': 'Active Pilot DMA Zones',
    'kpi-active-sub': 'Baku, Absheron, Ganja, Shirvan',
    'kpi-active-badge': 'Pilot telemetry',

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

    // Generic Common Terms
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
  },
};

export function useLanguage() {
  const [lang, setLang] = useState<Language>('az');

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
