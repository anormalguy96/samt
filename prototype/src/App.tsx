import React, { useState, useEffect } from 'react';
import { DashboardLayout } from './components/templates/DashboardLayout';
import { GisCanvasExplorer } from './components/organisms/GisCanvasExplorer';
import { MnfDiurnalChart } from './components/organisms/MnfDiurnalChart';
import { C4ArchitectureViewer } from './components/organisms/C4ArchitectureViewer';
import { LeakLifecycleFsm } from './components/organisms/LeakLifecycleFsm';
import { DbcContractExplorer } from './components/organisms/DbcContractExplorer';
import { HexagonalInspector } from './components/organisms/HexagonalInspector';
import { TestabilityHarness } from './components/organisms/TestabilityHarness';
import { WorkOrderManager } from './components/organisms/WorkOrderManager';
import { MilpAllocationSolver } from './components/organisms/MilpAllocationSolver';
import { IpmvpSavingsCalculator } from './components/organisms/IpmvpSavingsCalculator';

import { DomainProvider, useDomain } from './context/DomainContext';
import { useLanguage } from './hooks/useLanguage';
import { useTelemetryStream } from './hooks/useTelemetryStream';
import { useGisNetwork } from './hooks/useGisNetwork';
import { useMnfAnalysis } from './hooks/useMnfAnalysis';
import type { TabId } from './types';

const AppContent: React.FC = () => {
  const { lang, setLang, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabId>('tab-gis');

  const domain = useDomain();
  const telemetry = useTelemetryStream();
  const gis = useGisNetwork();

  // Keep GIS selected DMA and Domain selected DMA in sync
  useEffect(() => {
    if (gis.selectedDmaId !== domain.selectedDmaId) {
      domain.setSelectedDmaId(gis.selectedDmaId);
    }
  }, [gis.selectedDmaId, domain]);

  const handleSelectDma = (id: string) => {
    gis.setSelectedDmaId(id);
    domain.setSelectedDmaId(id);
  };

  // Connect MNF calculation directly to domain selected DMA and fault injections
  const mnf = useMnfAnalysis({
    dmaId: domain.selectedDmaId,
    hasBurstAnomaly: domain.hasBurstAnomaly,
    hasTankRefill: domain.hasTankRefill,
  });

  const activeAnomaliesCount = domain.incidents.filter(
    (i) => i.state !== 'CLOSED' && i.state !== 'FALSE_ALARM'
  ).length;

  return (
    <DashboardLayout
      currentLang={lang}
      onToggleLang={setLang}
      t={t}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      packetRate={domain.hasCorruptedPacket ? 0 : telemetry.packetRate}
      totalInflowM3h={telemetry.totalInflowM3h}
      nrwPercentage={telemetry.nrwPercentage}
      activeAnomalies={activeAnomaliesCount}
      activeDmas={telemetry.activeDmas}
      cloudZone={telemetry.cloudZone}
    >
      {activeTab === 'tab-gis' && (
        <GisCanvasExplorer
          dmaList={gis.dmaList}
          pipes={gis.pipes}
          selectedDma={gis.selectedDma}
          selectedDmaId={domain.selectedDmaId}
          onSelectDma={handleSelectDma}
          onViewBalance={() => setActiveTab('tab-balance')}
        />
      )}

      {activeTab === 'tab-balance' && (
        <MnfDiurnalChart
          hourlyData={mnf.hourlyData}
          mnfStats={mnf.mnfStats}
          hasBurstAnomaly={domain.hasBurstAnomaly}
          onToggleBurstAnomaly={domain.toggleBurstAnomaly}
        />
      )}

      {activeTab === 'tab-c4' && (
        <div className="space-y-6">
          <C4ArchitectureViewer />
          <LeakLifecycleFsm />
        </div>
      )}

      {activeTab === 'tab-dbc' && <DbcContractExplorer />}

      {activeTab === 'tab-hexagonal' && <HexagonalInspector />}

      {activeTab === 'tab-testability' && <TestabilityHarness />}

      {activeTab === 'tab-workorders' && <WorkOrderManager />}

      {activeTab === 'tab-allocation' && <MilpAllocationSolver />}

      {activeTab === 'tab-opendata' && <IpmvpSavingsCalculator />}
    </DashboardLayout>
  );
};

export const App: React.FC = () => {
  return (
    <DomainProvider>
      <AppContent />
    </DomainProvider>
  );
};

export default App;
