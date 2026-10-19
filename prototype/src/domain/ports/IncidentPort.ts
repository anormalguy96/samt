/**
 * Incident Port & Event Lifecycle Contracts (Lectures 2 & 4: State Machines & DIP)
 * Models the canonical physical leak incident lifecycle with strong guards and typed events.
 */

export type IncidentState = 
  | 'DETECTED'
  | 'ASSIGNED'
  | 'IN_REPAIR'
  | 'REPAIRED'
  | 'VERIFIED'
  | 'CLOSED'
  | 'FALSE_ALARM';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'CRITICAL' | 'EMERGENCY';

export interface CrewAssignment {
  crewId: string;
  crewName: string;
  crewPhone: string;
  role: string;
  etaMinutes: number;
  assignedAt: Date;
}

export interface RepairEvidence {
  technicianId: string;
  repairMethod: string;
  clampType?: string;
  acousticFreqHz?: number;
  photoFixtureRef: string; // Labeled explicitly as fixture metadata, not fake cloud storage
  completedAt: Date;
  technicianNotes: string;
}

export interface VerificationResult {
  evaluatedAt: Date;
  preRepairMnfM3h: number;
  postRepairMnfM3h: number;
  baselineMnfM3h: number;
  verifiedLossDropM3h: number;
  isSuccessful: boolean;
  reason: string;
}

export interface Incident {
  incidentId: string;
  dmaId: string;
  pipeSegmentId?: string;
  title: string;
  detectedAt: Date;
  state: IncidentState;
  severity: IncidentSeverity;
  estimatedLossM3h: number;
  crewAssignment?: CrewAssignment;
  repairEvidence?: RepairEvidence;
  verificationResult?: VerificationResult;
  closedAt?: Date;
  falseAlarmReason?: string;
  version: number; // Version for optimistic concurrency control
}

export type IncidentEvent =
  | { type: 'ASSIGN'; crew: CrewAssignment }
  | { type: 'MARK_FALSE_ALARM'; reviewerId: string; reason: string }
  | { type: 'START_REPAIR'; technicianId: string; checkInGps?: string }
  | { type: 'RECORD_REPAIR_EVIDENCE'; evidence: RepairEvidence }
  | { type: 'EVALUATE_VERIFICATION'; evaluation: VerificationResult }
  | { type: 'CLOSE'; closedBy: string; notes?: string };

export interface IIncidentRepository {
  getById(id: string): Promise<Incident | undefined>;
  getAll(): Promise<Incident[]>;
  getByDma(dmaId: string): Promise<Incident[]>;
  save(incident: Incident): Promise<void>;
  update(incident: Incident): Promise<void>;
}
