/**
 * Incident Port & Event Lifecycle Contracts (Lectures 2 & 4: State Machines & DIP)
 * Models the canonical physical leak incident lifecycle with strict guards,
 * evidence-based verification, optimistic concurrency, and idempotent commands.
 */

import type { AuditEvent } from './AuditPort.js';

export type IncidentState =
  | 'DETECTED'
  | 'ASSIGNED'
  | 'IN_REPAIR'
  | 'REPAIRED'
  | 'VERIFIED'
  | 'CLOSED'
  | 'FALSE_ALARM';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'CRITICAL' | 'EMERGENCY';

export const VALID_INCIDENT_STATES: readonly IncidentState[] = [
  'DETECTED',
  'ASSIGNED',
  'IN_REPAIR',
  'REPAIRED',
  'VERIFIED',
  'CLOSED',
  'FALSE_ALARM',
] as const;

export const VALID_INCIDENT_SEVERITIES: readonly IncidentSeverity[] = [
  'LOW',
  'MEDIUM',
  'CRITICAL',
  'EMERGENCY',
] as const;

export interface CrewAssignment {
  crewId: string;
  crewName: string;
  crewPhone: string;
  role: string;
  etaMinutes: number;
  assignedAt: Date;
  assignedBy?: string;
}

export interface RepairEvidence {
  technicianId: string;
  repairMethod: string;
  clampType?: string;
  acousticFreqHz?: number;
  photoFixtureRef: string; // Explicit synthetic/fixture reference metadata
  completedAt: Date;
  technicianNotes: string;
  recordedBy?: string;
}

export interface VerificationWindowEvidence {
  windowStart: Date;
  windowEnd: Date;
  sampleCount: number;
  coverageRatio: number; // 0.0 to 1.0
  mnfM3h: number;
  avgPressureBar?: number;
  authorizedAllowanceM3h?: number;
  provenance: string; // e.g., 'POSTGRES_PERSISTED_TELEMETRY' or 'SYNTHETIC_FIXTURE_WINDOW'
}

export interface VerificationEvidenceInput {
  preRepairWindow: VerificationWindowEvidence;
  postRepairWindow: VerificationWindowEvidence;
  baselineMnfM3h: number;
  leakageExponent?: number; // Default 0.5 for pressure normalization when pressures differ
  /** Any caller-supplied success flag is ignored by server/domain verification */
  claimedSuccess?: boolean;
  /** @deprecated Ignored if supplied by untrusted caller */
  isSuccessful?: boolean;
}

export type VerificationOutcome =
  | 'VERIFIED_SYNTHETIC_POLICY'
  | 'FAILED_REWORK_REQUIRED'
  | 'INSUFFICIENT_EVIDENCE';

export interface VerificationResult {
  evaluatedAt: Date;
  evaluatedBy?: string;
  outcome: VerificationOutcome;
  preRepairMnfM3h: number;
  postRepairMnfM3h: number;
  pressureNormalizedPreMnfM3h: number;
  baselineMnfM3h: number;
  verifiedLossDropM3h: number;
  isSuccessful: boolean; // Derived strictly from outcome === 'VERIFIED_SYNTHETIC_POLICY'
  policyLabel: string;
  preRepairWindow?: VerificationWindowEvidence;
  postRepairWindow?: VerificationWindowEvidence;
  assumptions: string[];
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
  closedBy?: string;
  falseAlarmReason?: string;
  version: number; // Monotonically incremented optimistic concurrency version
}

export interface AuthorizedActor {
  actorId: string;
  role: 'dispatcher' | 'viewer' | 'system';
}

export type IncidentEvent =
  | { type: 'ASSIGN'; crew: Omit<CrewAssignment, 'assignedAt' | 'assignedBy'> & { assignedAt?: Date } }
  | { type: 'MARK_FALSE_ALARM'; reason: string; reviewerId?: string }
  | { type: 'START_REPAIR'; technicianId: string; checkInGps?: string }
  | { type: 'RECORD_REPAIR_EVIDENCE'; evidence: Omit<RepairEvidence, 'completedAt' | 'recordedBy'> & { completedAt?: Date } }
  | { type: 'EVALUATE_VERIFICATION'; evidence: VerificationEvidenceInput }
  | { type: 'CLOSE'; notes?: string; closedBy?: string };

export class OptimisticConcurrencyError extends Error {
  readonly code = 'VERSION_CONFLICT';
  constructor(
    public readonly incidentId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `Optimistic concurrency conflict on incident ${incidentId}: expected version ${expectedVersion}, actual version ${actualVersion}`
    );
    this.name = 'OptimisticConcurrencyError';
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT';
  constructor(public readonly commandId: string, message?: string) {
    super(
      message ??
        `Idempotency conflict for command ${commandId}: same commandId was previously executed with a different payload`
    );
    this.name = 'IdempotencyConflictError';
  }
}

export class DuplicateIncidentError extends Error {
  readonly code = 'DUPLICATE_INCIDENT';
  constructor(public readonly incidentId: string) {
    super(`Incident with ID ${incidentId} already exists in repository`);
    this.name = 'DuplicateIncidentError';
  }
}

export class IncidentNotFoundError extends Error {
  readonly code = 'INCIDENT_NOT_FOUND';
  constructor(public readonly incidentId: string) {
    super(`Incident with ID ${incidentId} was not found`);
    this.name = 'IncidentNotFoundError';
  }
}

export class InvalidIncidentDataError extends Error {
  readonly code = 'INVALID_INCIDENT_DATA';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidIncidentDataError';
  }
}

export interface CommandOutboxMessage {
  outboxId: string;
  idempotencyKey: string;
  incidentId: string;
  dmaId: string;
  recipient: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  message: string;
  payload: Record<string, unknown>;
}

export interface AtomicCommandRequest {
  commandId: string;
  incidentId: string;
  expectedVersion: number;
  actor: AuthorizedActor;
  eventType: IncidentEvent['type'];
  payloadHash: string;
  nextIncident: Incident;
  auditEvent: AuditEvent;
  outboxMessage?: CommandOutboxMessage;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  /** Optional test seam invoked inside the transaction immediately before COMMIT */
  beforeCommitHook?: () => void | Promise<void>;
}

export interface AtomicCommandResult {
  idempotentReplay: boolean;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  incident: Incident;
}

export interface StoredCommandOutcome {
  commandId: string;
  incidentId: string;
  payloadHash: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
}

export interface IIncidentRepository {
  getById(id: string): Promise<Incident | undefined>;
  getAll(): Promise<Incident[]>;
  getByDma(dmaId: string): Promise<Incident[]>;
  save(incident: Incident): Promise<void>;
  /**
   * Compare-and-swap update requiring explicit expectedVersion.
   * Rejects same-version or stale-version updates with OptimisticConcurrencyError.
   */
  update(incident: Incident, expectedVersion: number): Promise<void>;
  /**
   * Look up a previously committed idempotent command outcome.
   */
  getCommandOutcome?(commandId: string): Promise<StoredCommandOutcome | undefined>;
  /**
   * Atomically commits incident CAS update, command idempotency record, audit event,
   * and optional outbox notification in one transaction.
   */
  commitCommand?(request: AtomicCommandRequest): Promise<AtomicCommandResult>;
}

function cloneDate(d: Date): Date {
  return new Date(d.getTime());
}

/**
 * Deep-clones an Incident including nested evidence objects and Date instances
 * so callers cannot mutate repository-owned state.
 */
export function deepCloneIncident(inc: Incident): Incident {
  return {
    incidentId: inc.incidentId,
    dmaId: inc.dmaId,
    pipeSegmentId: inc.pipeSegmentId,
    title: inc.title,
    detectedAt: cloneDate(inc.detectedAt),
    state: inc.state,
    severity: inc.severity,
    estimatedLossM3h: inc.estimatedLossM3h,
    crewAssignment: inc.crewAssignment
      ? {
          ...inc.crewAssignment,
          assignedAt: cloneDate(inc.crewAssignment.assignedAt),
        }
      : undefined,
    repairEvidence: inc.repairEvidence
      ? {
          ...inc.repairEvidence,
          completedAt: cloneDate(inc.repairEvidence.completedAt),
        }
      : undefined,
    verificationResult: inc.verificationResult
      ? {
          ...inc.verificationResult,
          evaluatedAt: cloneDate(inc.verificationResult.evaluatedAt),
          assumptions: [...inc.verificationResult.assumptions],
          preRepairWindow: inc.verificationResult.preRepairWindow
            ? {
                ...inc.verificationResult.preRepairWindow,
                windowStart: cloneDate(inc.verificationResult.preRepairWindow.windowStart),
                windowEnd: cloneDate(inc.verificationResult.preRepairWindow.windowEnd),
              }
            : undefined,
          postRepairWindow: inc.verificationResult.postRepairWindow
            ? {
                ...inc.verificationResult.postRepairWindow,
                windowStart: cloneDate(inc.verificationResult.postRepairWindow.windowStart),
                windowEnd: cloneDate(inc.verificationResult.postRepairWindow.windowEnd),
              }
            : undefined,
        }
      : undefined,
    closedAt: inc.closedAt ? cloneDate(inc.closedAt) : undefined,
    closedBy: inc.closedBy,
    falseAlarmReason: inc.falseAlarmReason,
    version: inc.version,
  };
}

/**
 * Validates structural and domain invariants of an Incident record (used on seed & persistence boundaries).
 */
export function validateIncidentRecord(raw: unknown): Incident {
  if (!raw || typeof raw !== 'object') {
    throw new InvalidIncidentDataError('Incident record must be a non-null object');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.incidentId !== 'string' || obj.incidentId.trim().length === 0) {
    throw new InvalidIncidentDataError('Incident requires a non-empty string incidentId');
  }
  if (typeof obj.dmaId !== 'string' || obj.dmaId.trim().length === 0) {
    throw new InvalidIncidentDataError(`Incident ${obj.incidentId} requires a non-empty string dmaId`);
  }
  if (typeof obj.title !== 'string' || obj.title.trim().length === 0) {
    throw new InvalidIncidentDataError(`Incident ${obj.incidentId} requires a non-empty title`);
  }
  if (!VALID_INCIDENT_STATES.includes(obj.state as IncidentState)) {
    throw new InvalidIncidentDataError(`Incident ${obj.incidentId} has invalid state: ${String(obj.state)}`);
  }
  if (!VALID_INCIDENT_SEVERITIES.includes(obj.severity as IncidentSeverity)) {
    throw new InvalidIncidentDataError(`Incident ${obj.incidentId} has invalid severity: ${String(obj.severity)}`);
  }
  if (typeof obj.estimatedLossM3h !== 'number' || !Number.isFinite(obj.estimatedLossM3h) || obj.estimatedLossM3h < 0) {
    throw new InvalidIncidentDataError(`Incident ${obj.incidentId} has invalid estimatedLossM3h`);
  }
  if (typeof obj.version !== 'number' || !Number.isInteger(obj.version) || obj.version < 1) {
    throw new InvalidIncidentDataError(`Incident ${obj.incidentId} must have integer version >= 1`);
  }
  const detectedAt = obj.detectedAt instanceof Date ? obj.detectedAt : new Date(String(obj.detectedAt ?? ''));
  if (!Number.isFinite(detectedAt.getTime())) {
    throw new InvalidIncidentDataError(`Incident ${obj.incidentId} has invalid detectedAt timestamp`);
  }

  const normalized: Incident = {
    incidentId: obj.incidentId,
    dmaId: obj.dmaId,
    pipeSegmentId: typeof obj.pipeSegmentId === 'string' ? obj.pipeSegmentId : undefined,
    title: obj.title,
    detectedAt,
    state: obj.state as IncidentState,
    severity: obj.severity as IncidentSeverity,
    estimatedLossM3h: obj.estimatedLossM3h,
    version: obj.version,
    closedBy: typeof obj.closedBy === 'string' ? obj.closedBy : undefined,
    falseAlarmReason: typeof obj.falseAlarmReason === 'string' ? obj.falseAlarmReason : undefined,
  };

  if (obj.closedAt !== undefined && obj.closedAt !== null) {
    const closedAt = obj.closedAt instanceof Date ? obj.closedAt : new Date(String(obj.closedAt));
    if (!Number.isFinite(closedAt.getTime())) {
      throw new InvalidIncidentDataError(`Incident ${obj.incidentId} has invalid closedAt timestamp`);
    }
    normalized.closedAt = closedAt;
  }

  if (obj.crewAssignment !== undefined && obj.crewAssignment !== null) {
    const crew = obj.crewAssignment as Record<string, unknown>;
    const assignedAt = crew.assignedAt instanceof Date ? crew.assignedAt : new Date(String(crew.assignedAt ?? ''));
    if (
      typeof crew.crewId !== 'string' ||
      typeof crew.crewName !== 'string' ||
      typeof crew.crewPhone !== 'string' ||
      typeof crew.role !== 'string' ||
      typeof crew.etaMinutes !== 'number' ||
      !Number.isFinite(crew.etaMinutes) ||
      crew.etaMinutes < 0 ||
      !Number.isFinite(assignedAt.getTime())
    ) {
      throw new InvalidIncidentDataError(`Incident ${obj.incidentId} has malformed crewAssignment`);
    }
    normalized.crewAssignment = {
      crewId: crew.crewId,
      crewName: crew.crewName,
      crewPhone: crew.crewPhone,
      role: crew.role,
      etaMinutes: crew.etaMinutes,
      assignedAt,
      assignedBy: typeof crew.assignedBy === 'string' ? crew.assignedBy : undefined,
    };
  }

  if (obj.repairEvidence !== undefined && obj.repairEvidence !== null) {
    const ev = obj.repairEvidence as Record<string, unknown>;
    const completedAt = ev.completedAt instanceof Date ? ev.completedAt : new Date(String(ev.completedAt ?? ''));
    if (
      typeof ev.technicianId !== 'string' ||
      typeof ev.repairMethod !== 'string' ||
      typeof ev.photoFixtureRef !== 'string' ||
      typeof ev.technicianNotes !== 'string' ||
      !Number.isFinite(completedAt.getTime())
    ) {
      throw new InvalidIncidentDataError(`Incident ${obj.incidentId} has malformed repairEvidence`);
    }
    normalized.repairEvidence = {
      technicianId: ev.technicianId,
      repairMethod: ev.repairMethod,
      clampType: typeof ev.clampType === 'string' ? ev.clampType : undefined,
      acousticFreqHz: typeof ev.acousticFreqHz === 'number' ? ev.acousticFreqHz : undefined,
      photoFixtureRef: ev.photoFixtureRef,
      completedAt,
      technicianNotes: ev.technicianNotes,
      recordedBy: typeof ev.recordedBy === 'string' ? ev.recordedBy : undefined,
    };
  }

  if (obj.verificationResult !== undefined && obj.verificationResult !== null) {
    const vr = obj.verificationResult as Record<string, unknown>;
    const evaluatedAt = vr.evaluatedAt instanceof Date ? vr.evaluatedAt : new Date(String(vr.evaluatedAt ?? ''));
    if (
      !Number.isFinite(evaluatedAt.getTime()) ||
      typeof vr.preRepairMnfM3h !== 'number' ||
      typeof vr.postRepairMnfM3h !== 'number' ||
      typeof vr.baselineMnfM3h !== 'number' ||
      typeof vr.verifiedLossDropM3h !== 'number' ||
      typeof vr.isSuccessful !== 'boolean' ||
      typeof vr.reason !== 'string'
    ) {
      throw new InvalidIncidentDataError(`Incident ${obj.incidentId} has malformed verificationResult`);
    }

    const parseWin = (w: unknown): VerificationWindowEvidence | undefined => {
      if (!w || typeof w !== 'object') return undefined;
      const win = w as Record<string, unknown>;
      const ws = win.windowStart instanceof Date ? win.windowStart : new Date(String(win.windowStart ?? ''));
      const we = win.windowEnd instanceof Date ? win.windowEnd : new Date(String(win.windowEnd ?? ''));
      if (!Number.isFinite(ws.getTime()) || !Number.isFinite(we.getTime())) {
        throw new InvalidIncidentDataError(`Incident ${obj.incidentId} has invalid verification window timestamps`);
      }
      return {
        windowStart: ws,
        windowEnd: we,
        sampleCount: Number(win.sampleCount),
        coverageRatio: Number(win.coverageRatio),
        mnfM3h: Number(win.mnfM3h),
        avgPressureBar: win.avgPressureBar !== undefined ? Number(win.avgPressureBar) : undefined,
        authorizedAllowanceM3h:
          win.authorizedAllowanceM3h !== undefined ? Number(win.authorizedAllowanceM3h) : undefined,
        provenance: String(win.provenance ?? 'UNKNOWN'),
      };
    };

    const outcome: VerificationOutcome =
      vr.outcome === 'VERIFIED_SYNTHETIC_POLICY' ||
      vr.outcome === 'FAILED_REWORK_REQUIRED' ||
      vr.outcome === 'INSUFFICIENT_EVIDENCE'
        ? vr.outcome
        : vr.isSuccessful
        ? 'VERIFIED_SYNTHETIC_POLICY'
        : 'FAILED_REWORK_REQUIRED';

    normalized.verificationResult = {
      evaluatedAt,
      evaluatedBy: typeof vr.evaluatedBy === 'string' ? vr.evaluatedBy : undefined,
      outcome,
      preRepairMnfM3h: vr.preRepairMnfM3h,
      postRepairMnfM3h: vr.postRepairMnfM3h,
      pressureNormalizedPreMnfM3h:
        typeof vr.pressureNormalizedPreMnfM3h === 'number'
          ? vr.pressureNormalizedPreMnfM3h
          : vr.preRepairMnfM3h,
      baselineMnfM3h: vr.baselineMnfM3h,
      verifiedLossDropM3h: vr.verifiedLossDropM3h,
      isSuccessful: outcome === 'VERIFIED_SYNTHETIC_POLICY',
      policyLabel:
        typeof vr.policyLabel === 'string'
          ? vr.policyLabel
          : 'Verified under SAMT synthetic policy (not field-measured physical proof)',
      preRepairWindow: parseWin(vr.preRepairWindow),
      postRepairWindow: parseWin(vr.postRepairWindow),
      assumptions: Array.isArray(vr.assumptions) ? vr.assumptions.map(String) : [],
      reason: vr.reason,
    };
  }

  return deepCloneIncident(normalized);
}
