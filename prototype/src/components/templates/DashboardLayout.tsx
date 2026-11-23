import React, { useRef } from 'react';
import { HeaderBar } from '../organisms/HeaderBar';
import { FooterBar } from '../organisms/FooterBar';
import { MetricStatCard } from '../molecules/MetricStatCard';
import { TabNavItem } from '../molecules/TabNavItem';
import { Button } from '../atoms/Button';
import { FeatureErrorBoundary } from '../error-boundaries/FeatureErrorBoundary';
import { useDomain } from '../../context/DomainContext';
import type { TabId, Language } from '../../types';

export interface DashboardLayoutProps {
  currentLang: Language;
  onToggleLang: (lang: Language) => void;
  t: (key: string) => string;
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  observedSamples: number;
  totalInflowM3: number;
  residualPct: number;
  activeAnomalies: number;
  activeDmas: number;
  environmentLabel: string;
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  currentLang,
  onToggleLang,
  t,
  activeTab,
  onSelectTab,
  observedSamples,
  totalInflowM3,
  residualPct,
  activeAnomalies,
  activeDmas,
  environmentLabel,
  children,
}) => {
  const tabsListRef = useRef<HTMLDivElement>(null);
  const {
    runtimeMode,
    apiStatus,
    apiError,
    staleConflict,
    clearStaleConflict,
    refreshBackend,
  } = useDomain();

  const tabs = [
    { id: 'tab-workorders' as TabId, label: t('tab-workorders'), icon: 'alert' as const, badge: `${activeAnomalies}` },
    { id: 'tab-balance' as TabId, label: t('tab-balance'), icon: 'chart' as const },
    { id: 'tab-gis' as TabId, label: t('tab-gis'), icon: 'map' as const },
    { id: 'tab-c4' as TabId, label: t('tab-c4'), icon: 'layers' as const, badge: 'L1–L3' },
    { id: 'tab-dbc' as TabId, label: t('tab-dbc'), icon: 'terminal' as const, badge: 'L3' },
    { id: 'tab-hexagonal' as TabId, label: t('tab-hexagonal'), icon: 'server' as const, badge: 'L4' },
    { id: 'tab-testability' as TabId, label: t('tab-testability'), icon: 'clock' as const, badge: 'L5' },
    { id: 'tab-allocation' as TabId, label: t('tab-allocation'), icon: 'cpu' as const },
    { id: 'tab-opendata' as TabId, label: t('tab-opendata'), icon: 'water' as const },
  ];

  const handleTablistKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = tabs.length - 1;
    else return;

    e.preventDefault();
    onSelectTab(tabs[nextIndex].id);
    const tabButtons = tabsListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    if (tabButtons && tabButtons[nextIndex]) {
      tabButtons[nextIndex].focus();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-navy-950 text-slate-100 font-sans selection:bg-cyan-primary selection:text-navy-950">
      <HeaderBar
        currentLang={currentLang}
        onToggleLang={onToggleLang}
        t={t}
        observedSamples={observedSamples}
        environmentLabel={environmentLabel}
      />

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Runtime Mode & Fault Status Banners */}
        {runtimeMode === 'STATIC_DEMO' && (
          <div
            role="status"
            data-testid="demo-mode-banner"
            className="p-3 rounded-xl bg-amber-warning/10 border border-amber-warning/40 text-xs font-mono text-amber-warning flex flex-wrap items-center justify-between gap-2"
          >
            <span>{t('state-demo-notice')}</span>
          </div>
        )}

        {runtimeMode === 'INTEGRATED_API' && apiStatus === 'UNAVAILABLE' && (
          <div
            role="alert"
            data-testid="api-unavailable-banner"
            className="p-3.5 rounded-xl bg-rose-critical/15 border border-rose-critical/50 text-xs font-mono text-rose-critical flex flex-wrap items-center justify-between gap-3"
          >
            <div>
              <div className="font-bold">{t('state-unavailable')}</div>
              {apiError && <div className="text-[11px] opacity-90 mt-0.5">{apiError}</div>}
            </div>
            <Button size="sm" variant="danger" onClick={() => refreshBackend()}>
              {t('btn-retry')}
            </Button>
          </div>
        )}

        {staleConflict && (
          <div
            role="alert"
            data-testid="stale-conflict-banner"
            className="p-3.5 rounded-xl bg-amber-warning/15 border border-amber-warning/50 text-xs font-mono text-amber-warning flex flex-wrap items-center justify-between gap-3"
          >
            <div>
              <div className="font-bold">{t('state-conflict')}</div>
              <div className="text-[11px] mt-0.5">
                {staleConflict.incidentId} (expected v{staleConflict.expectedVersion}
                {staleConflict.currentVersion ? `, server v${staleConflict.currentVersion}` : ''}) — {staleConflict.message}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  clearStaleConflict();
                  await refreshBackend();
                }}
              >
                {t('btn-refresh')}
              </Button>
            </div>
          </div>
        )}

        {/* KPI Summary Cards */}
        <section
          aria-label="Operational metrics summary"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <MetricStatCard
            title={t('kpi-inflow-title')}
            value={`${totalInflowM3.toFixed(2)} m³`}
            subtitle={t('kpi-inflow-sub')}
            iconName="water"
            badgeText={t('kpi-inflow-badge')}
            badgeVariant="info"
          />

          <MetricStatCard
            title={t('kpi-nrw-title')}
            value={`${residualPct}%`}
            subtitle={t('kpi-nrw-sub')}
            iconName="gauge"
            badgeText={t('kpi-nrw-badge')}
            badgeVariant="warning"
          />

          <MetricStatCard
            title={t('kpi-anomalies-title')}
            value={`${activeAnomalies} ${currentLang === 'az' ? 'aktiv' : 'active'}`}
            subtitle={t('kpi-anomalies-sub')}
            iconName="alert"
            badgeText={t('kpi-anomalies-badge')}
            badgeVariant="critical"
          />

          <MetricStatCard
            title={t('kpi-active-title')}
            value={`${activeDmas} ${currentLang === 'az' ? 'DMA' : 'DMAs'}`}
            subtitle={t('kpi-active-sub')}
            iconName="map"
            badgeText={t('kpi-active-badge')}
            badgeVariant="nominal"
          />
        </section>

        {/* Tab Navigation Bar */}
        <nav
          ref={tabsListRef}
          role="tablist"
          aria-label="SAMT operational modules"
          onKeyDown={handleTablistKeyDown}
          className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-navy-900 border border-slate-800/80 overflow-x-auto scrollbar-none shadow-inner"
        >
          {tabs.map((tab) => (
            <TabNavItem
              key={tab.id}
              id={tab.id}
              label={tab.label}
              iconName={tab.icon}
              isActive={activeTab === tab.id}
              onSelect={onSelectTab}
              badge={tab.badge}
            />
          ))}
        </nav>

        {/* Dynamic Tab Panel */}
        <section id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-btn-${activeTab}`}>
          <FeatureErrorBoundary featureTitle={t(activeTab)}>
            {children}
          </FeatureErrorBoundary>
        </section>
      </main>

      <FooterBar />
    </div>
  );
};
