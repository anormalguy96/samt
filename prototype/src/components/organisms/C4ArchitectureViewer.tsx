import React, { useState } from 'react';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { Icon } from '../atoms/Icon';
import type { C4Model } from '../../types';

export const C4ArchitectureViewer: React.FC = () => {
  const [activeLevel, setActiveLevel] = useState<'l1' | 'l2' | 'l3' | 'prototype'>('prototype');

  const c4Models: Record<'l1' | 'l2' | 'l3' | 'prototype', C4Model> = {
    prototype: {
      title: 'Cari Reallaşdırma: Hexagonal Prototip Memarlığı (In-Memory & Test Seams)',
      cards: [
        {
          name: 'Domain Core (Saf TypeScript Mühərriki)',
          tech: 'Pure Domain Logic · Sıfır Kənar Asılılıq',
          desc: 'Kütlə balansı, Riman trapesiya inteqrasiyası, 02:00–04:00 gecə pəncərəsi süzgəci, təmiz FSM keçidləri və mütərəqqi doldurma (progressive filling) paylanması.',
        },
        {
          name: 'Hexagonal Portlar və Müqavilələr',
          tech: 'TypeScript İnterfeysləri (Clock, Telemetry, Incident, Audit)',
          desc: 'Clock.now(), ITelemetrySink, IIncidentRepository, IAuditSink, INotifier. Bütün domen funksiyaları yalnız bu dar portlara istinad edir (DIP / Hexagonal).',
        },
        {
          name: 'Əvəzlənə bilən Adapterlər (Dual Real Adapters)',
          tech: 'InMemoryIncidentRepository & ValidatedJsonFixtureIncidentRepository',
          desc: 'Tam funksional iki real adapter: yaddaşdaxili oxu/yazı və JSON fixturundan COW semantikası ilə oxu. Eyni port müqavilə testlərindən keçir.',
        },
        {
          name: 'Testability Seams & Test Doubles',
          tech: 'FixedClock & RecordingAuditSink (L5 İdarəolunanlıq)',
          desc: 'Deterministik vaxt manipulyasiyası (2026-10-20 03:00 Bakı vaxtı), audit və bildiriş casusu (spy/recording double) ilə tam müşahidəolunanlıq.',
        },
        {
          name: 'Reaktiv Vəziyyət Qatı (Domain Composition Root)',
          tech: 'React 19 Context · DomainProvider',
          desc: 'Domen nüvəsini tablararası vəziyyət sıfırlanmasından qoruyur. DMA seçimi, nasazlıq inyeksiyaları və hadisə keçidləri tablar dəyişdikdə itmir.',
        },
        {
          name: 'Yoxlanmış Müstəqil Müqavilələr',
          tech: 'OpenAPI 3.0.3 · Protobuf v3 · TimescaleDB DDL',
          desc: 'Markdown daxilindən çıxarılmış, müstəqil fayl kimi contracts/ qovluğunda saxlanılan, mTLS və canal_network_id ilə təchiz edilmiş spesifikasiyalar.',
        },
      ],
    },
    l1: {
      title: 'Hədəf Sistem Konteksti (C4 L1 - Gələcək İstehsalat Spesifikasiyası)',
      cards: [
        {
          name: 'SƏMT platforması',
          tech: 'Əsas paylanmış sistem (Hədəf Spesifikasiya)',
          desc: '150 pilot DMA zonasını monitorinq edir, hidravlik kütlə balansını hesablayır, sızmaları lokallaşdırır və Hökumət Buludunda ədalətli su paylanmasını cədvəlləşdirir.',
        },
        {
          name: 'Sahə telemetriya edge qovşaqları',
          tech: 'Ultrasəs və piezorezistiv IoT',
          desc: 'Axın və yüksək tezlikli təzyiq göstəricilərini hüceyrəvi qapalı APN üzərindən mTLS 1.3 ilə ötürür.',
        },
        {
          name: 'ADSEA dispetçerləri və mühəndisləri',
          tech: 'Daxili istifadəçilər',
          desc: 'Real vaxt milli su balansını izləyir, qəza həyəcanlarını təsdiqləyir və təmir briqadası dispetçerliyini idarə edir.',
        },
        {
          name: 'Su İstifadəçiləri Birlikləri (WUA)',
          tech: 'Kənd təsərrüfatı tərəfdaşları',
          desc: 'Regional suvarma sifarişlərini göndərir və audit edilə bilən ədalətli kanal paylanma cədvəllərini qəbul edir.',
        },
        {
          name: 'Vətəndaş portalı (mygov)',
          tech: 'Xarici dövlət sistemi',
          desc: 'Planlı və qəza su kəsintiləri barədə abonentlərə avtomatlaşdırılmış bildirişlər göndərilməsini təmin edir.',
        },
        {
          name: 'Açıq məlumat portalı (opendata.az)',
          tech: 'Açıq dövlət resursu',
          desc: 'Milli su balansı və qənaət göstəricilərinin ictimai hesabatlılığı üçün aqreqasiya olunmuş seriyaları təqdim edir.',
        },
      ],
    },
    l2: {
      title: 'Hədəf Konteynerlər (C4 L2 - Gələcək Hökumət Buludu Paylanmış Arxitekturası)',
      cards: [
        {
          name: 'İnqress şlüz konteyneri',
          tech: 'Rust / Axum · Zone 2 DMZ (Hədəf)',
          desc: 'mTLS 1.3 terminasiyası, X.509 cihaz sertifikatı yoxlanışı, Protobuf v3 deserializasiyası və Kafka-ya yönləndirmə (layihələndirilmiş hədəf).',
        },
        {
          name: 'Mesaj brokeri konteyneri',
          tech: 'Apache Kafka · Zone 3 Nüvə (Hədəf)',
          desc: 'İnqressi axın emalından ayırır; telemetriya axınını dma_id üzrə ardıcıl heşləmə ilə bölünmüş mövzulara paylayır.',
        },
        {
          name: 'Axın analitikası konteyneri',
          tech: 'Apache Flink · Zone 3 Nüvə (Hədəf)',
          desc: '15 dəqiqəlik kütlə balansı pəncərələri və 02:00–04:00 gecə pəncərəsində 5-ci persentil MNF hesablamasını aparır.',
        },
        {
          name: 'Vahid saxlama konteyneri',
          tech: 'PostgreSQL 16 + TimescaleDB + PostGIS (Hədəf)',
          desc: '3NF topoqrafik şəbəkə cədvəlləri ilə yanaşı zaman üzrə continuous aggregate hiper-cədvəlləri və ST_DWithin indekslərini saxlayır.',
        },
        {
          name: 'Bölgü həlledicisi konteyneri',
          tech: 'Python / Google OR-Tools · Zone 3 (Hədəf)',
          desc: 'Qarışıq tam ədədli xətti proqramlaşdırma (MILP) əsasında Pareto-ədalətli su paylanma optimallaşdırmasını icra edir.',
        },
        {
          name: 'Dispetçer idarəetmə paneli',
          tech: 'React / TypeScript / Tailwind · Zone 4 (Reallaşdırılıb)',
          desc: 'Mərkəzi nəzarət otağında vəziyyət fərqindəliyi, interaktiv GIS topoqrafiyası və iş əmrlərinin canlı monitorinqini təmin edir.',
        },
      ],
    },
    l3: {
      title: 'Hədəf Komponentlər (C4 L3 - DMA Su Balansı Servisi Spesifikasiyası)',
      cards: [
        {
          name: 'WindowedFlowAggregator',
          tech: 'Flink Stream Operator (Hədəf Spesifikasiya)',
          desc: '15 dəqiqəlik pəncərələrdə xalis delta həcmi hesablayır (Giriş - Çıxış - Qanuni istehlak).',
        },
        {
          name: 'NightBaselineFilter',
          tech: 'Domen servis komponenti (Prototipdə Reallaşdırılıb)',
          desc: '02:00–04:00 axın məlumatlarını süzür, dam çənlərinin doldurulmasını çıxır və 5-ci persentil sızma bazasını aşkarlayır.',
        },
        {
          name: 'BurstTransientDetector',
          tech: 'DSP / Təzyiq analizatoru (Hədəf Spesifikasiya)',
          desc: '50 Hz piezorezistiv təzyiq sensorlarından gələn mənfi təzyiq dalğalarını analiz edərək ani boru qırılmasını lokallaşdırır.',
        },
        {
          name: 'WorkOrderDispatcher',
          tech: 'Tətbiq servisi (Prototipdə Reallaşdırılıb)',
          desc: 'Prioritetləşdirilmiş təmir iş əmrlərini generasiya edir, yaxınlıqdakı briqadanı təyin edir və audit qeydlərini aparır.',
        },
      ],
    },
  };

  const currentModel = c4Models[activeLevel];

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <Icon name="layers" size={16} className="text-cyan-primary" />
            C4 memarlıq modeli və abstraksiya səviyyələri
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Simon Brown C4 modelinə uyğun sistem konteksti, konteynerlər, komponentlər və cari prototip
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={activeLevel === 'prototype' ? 'primary' : 'outline'}
            onClick={() => setActiveLevel('prototype')}
          >
            Cari Prototip (Hexagonal)
          </Button>
          <Button
            size="sm"
            variant={activeLevel === 'l1' ? 'primary' : 'outline'}
            onClick={() => setActiveLevel('l1')}
          >
            Hədəf L1: Kontekst
          </Button>
          <Button
            size="sm"
            variant={activeLevel === 'l2' ? 'primary' : 'outline'}
            onClick={() => setActiveLevel('l2')}
          >
            Hədəf L2: Konteynerlər
          </Button>
          <Button
            size="sm"
            variant={activeLevel === 'l3' ? 'primary' : 'outline'}
            onClick={() => setActiveLevel('l3')}
          >
            Hədəf L3: Komponentlər
          </Button>
        </div>
      </Card>

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-mono font-bold text-cyan-primary">
          {currentModel.title}
        </span>
        <Badge variant="info">
          {currentModel.cards.length} memarlıq vahidi
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {currentModel.cards.map((card, idx) => (
          <Card key={idx} hoverable className="flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold font-mono text-cyan-primary">
                <span>📦</span>
                <span>{card.name}</span>
              </div>
              <div className="text-[11px] font-mono text-emerald-brand/90 mt-1">
                {card.tech}
              </div>
              <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                {card.desc}
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800/80 mt-4 flex justify-between items-center text-[10px] font-mono text-slate-500">
              <span>Hökumət Buludu uyğunluğu</span>
              <span>C4 aktiv düyün</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
