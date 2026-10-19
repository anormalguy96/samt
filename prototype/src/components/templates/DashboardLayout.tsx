import React, { useRef } from 'react';
import { HeaderBar } from '../organisms/HeaderBar';
import { FooterBar } from '../organisms/FooterBar';
import { MetricStatCard } from '../molecules/MetricStatCard';
import { TabNavItem } from '../molecules/TabNavItem';
import { FeatureErrorBoundary } from '../error-boundaries/FeatureErrorBoundary';
import type { TabId, Language } from '../../types';

export interface DashboardLayoutProps {
  currentLang: Language;
  onToggleLang: (lang: Language) => void;
  t: (key: string) => string;
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  packetRate: number;
  totalInflowM3h: number;
  nrwPercentage: number;
  activeAnomalies: number;
  activeDmas: number;
  cloudZone: string;
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  currentLang,
  onToggleLang,
  t,
  activeTab,
  onSelectTab,
  packetRate,
  totalInflowM3h,
  nrwPercentage,
  activeAnomalies,
  activeDmas,
  cloudZone,
  children,
}) => {
  const tabsListRef = useRef<HTMLDivElement>(null);

  const tabs = [
    { id: 'tab-gis' as TabId, label: t('tab-gis'), icon: 'map' as const },
    { id: 'tab-balance' as TabId, label: t('tab-balance'), icon: 'chart' as const },
    { id: 'tab-c4' as TabId, label: t('tab-c4'), icon: 'layers' as const, badge: 'L1–L3' },
    { id: 'tab-dbc' as TabId, label: t('tab-dbc'), icon: 'terminal' as const, badge: 'L3' },
    { id: 'tab-hexagonal' as TabId, label: t('tab-hexagonal'), icon: 'server' as const, badge: 'L4' },
    { id: 'tab-testability' as TabId, label: t('tab-testability'), icon: 'clock' as const, badge: 'L5' },
    { id: 'tab-workorders' as TabId, label: t('tab-workorders'), icon: 'alert' as const, badge: `${activeAnomalies}` },
    { id: 'tab-allocation' as TabId, label: t('tab-allocation'), icon: 'cpu' as const },
    { id: 'tab-opendata' as TabId, label: t('tab-opendata'), icon: 'water' as const },
  ];

  // Accessible Keyboard Navigation for tablist (WAI-ARIA Tab Pattern)
  const handleTablistKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextTab = tabs[nextIndex];
    onSelectTab(nextTab.id);

    // Focus the next tab button
    const tabButtons = tabsListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    if (tabButtons && tabButtons[nextIndex]) {
      tabButtons[nextIndex].focus();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-navy-950 text-slate-100 font-sans selection:bg-cyan-primary selection:text-navy-950">
      {/* Sovereign Header */}
      <HeaderBar
        currentLang={currentLang}
        onToggleLang={onToggleLang}
        packetRate={packetRate}
        cloudZone={cloudZone}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* KPI Summary Cards */}
        <section aria-label="Milli su balansı göstəriciləri" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricStatCard
            title={t('kpi-inflow-title')}
            value={`${totalInflowM3h.toLocaleString('az-AZ')} m³/h`}
            subtitle={t('kpi-inflow-sub')}
            iconName="water"
            badgeText={t('kpi-inflow-badge')}
            badgeVariant="info"
          />

          <MetricStatCard
            title={t('kpi-nrw-title')}
            value={`${nrwPercentage}%`}
            subtitle={t('kpi-nrw-sub')}
            iconName="gauge"
            badgeText={t('kpi-nrw-badge')}
            badgeVariant="warning"
          />

          <MetricStatCard
            title={t('kpi-anomalies-title')}
            value={`${activeAnomalies} ${currentLang === 'az' ? 'ocaq' : 'active'}`}
            subtitle={t('kpi-anomalies-sub')}
            iconName="alert"
            badgeText={t('kpi-anomalies-badge')}
            badgeVariant="critical"
          />

          <MetricStatCard
            title={t('kpi-active-title')}
            value={`${activeDmas} ${currentLang === 'az' ? 'rayon' : 'DMAs'}`}
            subtitle={t('kpi-active-sub')}
            iconName="map"
            badgeText={t('kpi-active-badge')}
            badgeVariant="nominal"
          />
        </section>

        {/* Tab Navigation Bar with horizontal overflow handling and keyboard ARIA navigation */}
        <nav
          ref={tabsListRef}
          role="tablist"
          aria-label="SAMT əməliyyat modulları"
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

        {/* Dynamic Tab Panel View wrapped in FeatureErrorBoundary */}
        <section id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-btn-${activeTab}`}>
          <FeatureErrorBoundary featureTitle={t(activeTab)}>
            {children}
          </FeatureErrorBoundary>
        </section>
      </main>

      {/* Sovereign Credits & Legal Footer */}
      <FooterBar />
    </div>
  );
};
