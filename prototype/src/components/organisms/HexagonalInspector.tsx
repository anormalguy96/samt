import React from 'react';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { Icon } from '../atoms/Icon';
import { useDomain } from '../../context/DomainContext';

export const HexagonalInspector: React.FC = () => {
  const { activeDbAdapter, setActiveDbAdapter } = useDomain();

  const parnasSecrets = [
    {
      id: 'secret-1',
      secretTitle: 'Gizlədilən Sirr 1: Sayğac Rabitə Protokolları & Avadanlıq Fərqləri',
      description: 'Müxtəlif istehsalçıların (Kamstrup, Diehl, Sensus) fiziki rabitə formatları (Modbus RTU, M-Bus, LoRaWAN payload formatı).',
      hiddenMechanism: 'Şlüz adapterləri daxilində deserializasiya olunur; domen yalnız kanonik TelemetryObservation qəbul edir.',
      stablePort: 'Port: ITelemetrySink (Kanonik TelemetryObservation)',
    },
    {
      id: 'secret-2',
      secretTitle: 'Gizlədilən Sirr 2: Saxlama Mühərriki və Verilənlər Bazası Dialekti',
      description: 'Yaddaş kolleksiyası, JSON faylları və ya TimescaleDB continuous aggregate SQL sorğularının icra mexanizmi.',
      hiddenMechanism: 'IIncidentRepository interfeysi arxasında saxlanılır. Domen kodu saxlama mühərrikinin növündən asılı deyil.',
      stablePort: 'Port: IIncidentRepository (Domen İnsidentləri qaytarır)',
    },
    {
      id: 'secret-3',
      secretTitle: 'Gizlədilən Sirr 3: Su Paylanması Alqoritmi',
      description: 'Proqressiv doldurma, prioritetli bölgü və ya xətti proqramlaşdırma (LP/QP) həlledici mexanizmi.',
      hiddenMechanism: 'Bölgü modulu domen portu arxasında təcrid olunub; interfeys yalnız tələbatları və mövcud suyu qəbul edir.',
      stablePort: 'Port: IAllocationPolicy (AllocationPlanResult qaytarır)',
    },
  ];

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <Icon name="server" size={16} className="text-cyan-primary" />
            Heksaqonal memarlıq (portlar və adapterlər) və Parnas sirləri
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Mühazirə 4: Domen nüvəsi xarici baza və rabitə protokollarından tam təcrid olunub (DIP və Parnas informasiya gizlətməsi)
          </p>
        </div>

        <div className="flex items-center gap-2 bg-navy-950 p-1.5 rounded-xl border border-slate-800">
          <span className="text-xs font-mono text-slate-400 px-2">Aktiv repozitor adapteri:</span>
          <Button
            size="sm"
            variant={activeDbAdapter === 'IN_MEMORY' ? 'primary' : 'ghost'}
            onClick={() => setActiveDbAdapter('IN_MEMORY')}
          >
            InMemory Repository
          </Button>
          <Button
            size="sm"
            variant={activeDbAdapter === 'VALIDATED_FIXTURE' ? 'primary' : 'ghost'}
            onClick={() => setActiveDbAdapter('VALIDATED_FIXTURE')}
          >
            JSON Fixture Repository
          </Button>
        </div>
      </Card>

      {/* Active Adapter Status */}
      <Card
        glow
        borderVariant={activeDbAdapter === 'IN_MEMORY' ? 'cyan' : 'emerald'}
        className="p-4 bg-navy-900/90"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-navy-950 text-cyan-primary border border-slate-800">
              <Icon name="server" size={20} />
            </div>
            <div>
              <div className="text-xs font-mono font-bold text-slate-100">
                {activeDbAdapter === 'IN_MEMORY'
                  ? 'IIncidentRepository -> InMemoryIncidentRepository (Xalis Map saxlama)'
                  : 'IIncidentRepository -> ValidatedJsonFixtureIncidentRepository (Doğrulanmış JSON Fixture)'}
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                {activeDbAdapter === 'IN_MEMORY'
                  ? 'Domen testləri və canlı demo üçün xalis TypeScript Map() əsaslı oxuma/yazma adapteri (versiya yoxlanışı ilə).'
                  : 'Öncədən təsdiqlənmiş 3 pilot DMA insidentini yükləyən və seans daxilində copy-on-write dəstəkləyən adapter.'}
              </div>
            </div>
          </div>
          <Badge variant={activeDbAdapter === 'IN_MEMORY' ? 'info' : 'nominal'} showDot>
            {activeDbAdapter === 'IN_MEMORY' ? 'In-Memory Aktiv' : 'Fixture Aktiv'}
          </Badge>
        </div>
      </Card>

      {/* Parnas Information Hiding Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {parnasSecrets.map((secret) => (
          <Card key={secret.id} hoverable className="flex flex-col justify-between space-y-3">
            <div>
              <span className="text-xs font-mono font-bold text-cyan-primary">
                {secret.secretTitle}
              </span>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {secret.description}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-2 text-xs font-mono">
              <div className="text-slate-400">
                <span className="text-slate-500 block text-[10px]">Təcrid edilən realizasiya:</span>
                {secret.hiddenMechanism}
              </div>
              <div className="p-2 rounded bg-navy-950 text-emerald-brand text-[11px] border border-emerald-brand/20">
                {secret.stablePort}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
