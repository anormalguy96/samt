export type Language = 'az' | 'en';

export type TabId = 
  | 'tab-gis'
  | 'tab-balance'
  | 'tab-c4'
  | 'tab-dbc'
  | 'tab-hexagonal'
  | 'tab-testability'
  | 'tab-workorders'
  | 'tab-allocation'
  | 'tab-opendata';

export type StatusSeverity = 'nominal' | 'warning' | 'critical' | 'info' | 'neutral';

export interface DmaNode {
  id: string;
  name: string;
  pop: string;
  len: string;
  mat: string;
  soil: string;
  lof: number;
  cof: number;
  rpn: number;
  status: 'CRITICAL_BURST' | 'HIGH_BACKGROUND' | 'MODERATE' | 'OPTIMAL' | 'RESERVOIR_NODE';
  x: number;
  y: number;
  radius: number;
  color: string;
  inflow: number;
  outflow: number;
  pressure: number;
  nrw: number;
}

export interface PipeEdge {
  from: number;
  to: number;
  flow: number;
}

export interface WorkOrder {
  id: string;
  dma: string;
  time: string;
  loss: string;
  cost: string;
  status: 'ASSIGNED' | 'DISPATCHED' | 'IN_PROGRESS' | 'REPAIRED' | 'VERIFIED';
  crew: string;
  crewRole: string;
  crewPhone: string;
  eta: string;
  coordinates: string;
  method: string;
  acousticFreq: string;
  pressureDrop: string;
  stepIndex: number;
}

export interface AgriculturalConsumer {
  name: string;
  region: string;
  demand: number;
  weight: number;
  alloc: number;
  satisfaction: number;
  canalCapacity: number;
}

export interface C4Card {
  name: string;
  tech: string;
  desc: string;
}

export interface C4Model {
  title: string;
  cards: C4Card[];
}

export type FsmStateId = 'DETECTED' | 'ASSIGNED' | 'REPAIRED' | 'VERIFIED';

export interface FsmStateDef {
  id: FsmStateId;
  nameAz: string;
  nameEn: string;
  invariants: string;
  allowedEvents: string[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
}
