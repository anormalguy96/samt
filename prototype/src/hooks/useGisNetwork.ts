import { useState, useMemo } from 'react';
import type { DmaNode, PipeEdge } from '../types';

const initialDmaNetwork: DmaNode[] = [
  {
    id: 'DMA-YASAMAL-04',
    name: 'Yasamal DMA-04 (H. Cavid prospekti)',
    pop: '14,200',
    len: '18.4 km',
    mat: 'Asbest-Sement / Polad (1974)',
    soil: 'Yüksək Korroziyalı (Abşeron)',
    lof: 8.8,
    cof: 8.9,
    rpn: 78.3,
    status: 'CRITICAL_BURST',
    x: 280,
    y: 220,
    radius: 48,
    color: '#ff3b30',
    inflow: 412,
    outflow: 268,
    pressure: 4.8,
    nrw: 34.9,
  },
  {
    id: 'DMA-NASIMI-02',
    name: 'Nəsimi DMA-02 (28 May / D. Əliyeva)',
    pop: '19,800',
    len: '24.1 km',
    mat: 'Çuqun / Dəmir-Beton (1982)',
    soil: 'Orta Dərəcəli Gillik',
    lof: 6.2,
    cof: 7.4,
    rpn: 45.9,
    status: 'HIGH_BACKGROUND',
    x: 520,
    y: 190,
    radius: 54,
    color: '#ffab00',
    inflow: 560,
    outflow: 410,
    pressure: 5.2,
    nrw: 26.8,
  },
  {
    id: 'DMA-NIZAMI-07',
    name: 'Nizami DMA-07 (Qara Qarayev pr.)',
    pop: '22,400',
    len: '31.2 km',
    mat: 'Polietilen HDPE-100 (2018)',
    soil: 'Quru Qumlu Torpaq',
    lof: 2.1,
    cof: 4.8,
    rpn: 10.1,
    status: 'OPTIMAL',
    x: 740,
    y: 290,
    radius: 58,
    color: '#00e676',
    inflow: 640,
    outflow: 585,
    pressure: 4.1,
    nrw: 8.6,
  },
  {
    id: 'DMA-SABAIL-01',
    name: 'Səbail DMA-01 (İçərişəhər / Sahil)',
    pop: '11,100',
    len: '14.5 km',
    mat: 'Tökmə Çuqun / Kompozit (1968)',
    soil: 'Dənizsahili Rütubətli',
    lof: 5.4,
    cof: 8.1,
    rpn: 43.7,
    status: 'MODERATE',
    x: 430,
    y: 360,
    radius: 44,
    color: '#00e5ff',
    inflow: 330,
    outflow: 265,
    pressure: 3.9,
    nrw: 19.7,
  },
  {
    id: 'RES-CEYRANBATAN-01',
    name: 'Ceyranbatan Mərkəzi Su Anbarı (Giriş Hub)',
    pop: '580,000 (Tranzit)',
    len: '42.0 km magistral',
    mat: 'Polad Magistral Ø1400mm',
    soil: 'Mühəndis Bünövrəsi',
    lof: 1.0,
    cof: 10.0,
    rpn: 10.0,
    status: 'RESERVOIR_NODE',
    x: 120,
    y: 110,
    radius: 36,
    color: '#7c4dff',
    inflow: 4800,
    outflow: 4800,
    pressure: 7.5,
    nrw: 0.0,
  },
];

const initialPipes: PipeEdge[] = [
  { from: 4, to: 0, flow: 45 },
  { from: 0, to: 3, flow: 60 },
  { from: 1, to: 2, flow: 38 },
  { from: 1, to: 3, flow: 52 },
  { from: 4, to: 1, flow: 70 },
];

export function useGisNetwork() {
  const [dmaList] = useState<DmaNode[]>(initialDmaNetwork);
  const [pipes] = useState<PipeEdge[]>(initialPipes);
  const [selectedDmaId, setSelectedDmaId] = useState<string>('DMA-YASAMAL-04');
  const [hoveredDmaId, setHoveredDmaId] = useState<string | null>(null);

  const selectedDma = useMemo(
    () => dmaList.find((d) => d.id === selectedDmaId) || dmaList[0],
    [dmaList, selectedDmaId]
  );

  return {
    dmaList,
    pipes,
    selectedDma,
    selectedDmaId,
    hoveredDmaId,
    setSelectedDmaId,
    setHoveredDmaId,
  };
}
