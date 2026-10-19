/**
 * Validated JSON Fixture Incident Repository Adapter (Lecture 4: Hexagonal Ports & Adapters)
 * Seeded from a validated JSON fixture dataset with in-memory copy-on-write persistence.
 * 
 * Capabilities honestly stated:
 * - Read: Reads pre-configured baseline pilot incident records.
 * - Write: Supports in-memory copy-on-write updates during runtime simulation.
 * - Does not persist mutations to disk or a remote database across page reloads.
 */

import type { Incident, IIncidentRepository } from '../ports/IncidentPort';

export const INITIAL_FIXTURE_INCIDENTS: Incident[] = [
  {
    incidentId: 'INC-2026-YAS-001',
    dmaId: 'DMA-YASAMAL-04',
    pipeSegmentId: 'PIPE-YAS-4412',
    title: 'H. Cavid prospekti Ø200mm Asbest-Sement Boru Qəzası',
    detectedAt: new Date('2026-10-20T02:45:00+04:00'),
    state: 'DETECTED',
    severity: 'CRITICAL',
    estimatedLossM3h: 38.4,
    version: 1,
  },
  {
    incidentId: 'INC-2026-NAS-002',
    dmaId: 'DMA-NASIMI-02',
    pipeSegmentId: 'PIPE-NAS-1089',
    title: '28 May küçəsi Yüksək Fon Sızması',
    detectedAt: new Date('2026-10-20T01:15:00+04:00'),
    state: 'ASSIGNED',
    severity: 'MEDIUM',
    estimatedLossM3h: 19.2,
    crewAssignment: {
      crewId: 'CREW-BAKU-01',
      crewName: 'Bakı Qəza-Bərpa Briqadası #1',
      crewPhone: '+994 55 876-54-32',
      role: 'Usta: Rəşad Məmmədov',
      etaMinutes: 25,
      assignedAt: new Date('2026-10-20T01:30:00+04:00'),
    },
    version: 2,
  },
  {
    incidentId: 'INC-2026-SAB-003',
    dmaId: 'DMA-SABAIL-01',
    pipeSegmentId: 'PIPE-SAB-0312',
    title: 'İçərişəhər Tarixi Boru Kəməri Sızması',
    detectedAt: new Date('2026-10-19T14:20:00+04:00'),
    state: 'VERIFIED',
    severity: 'LOW',
    estimatedLossM3h: 8.5,
    crewAssignment: {
      crewId: 'CREW-BAKU-SPEC',
      crewName: 'Tarixi Şəbəkə Xüsusi Briqadası',
      crewPhone: '+994 70 333-22-11',
      role: 'Mühəndis: Elvin Qasımov',
      etaMinutes: 0,
      assignedAt: new Date('2026-10-19T14:40:00+04:00'),
    },
    repairEvidence: {
      technicianId: 'TECH-774',
      repairMethod: 'Kompozit Klemma Quraşdırılması (Ø150mm)',
      clampType: 'Mufta Kraun Ø150',
      acousticFreqHz: 16,
      photoFixtureRef: 'fixture://photos/repair-sab-0312.webp',
      completedAt: new Date('2026-10-19T17:30:00+04:00'),
      technicianNotes: 'Klemma təzyiq altında bərkidildi, sızma tam dayandırıldı.',
    },
    verificationResult: {
      evaluatedAt: new Date('2026-10-20T03:30:00+04:00'),
      preRepairMnfM3h: 34.5,
      postRepairMnfM3h: 26.0,
      baselineMnfM3h: 25.5,
      verifiedLossDropM3h: 8.5,
      isSuccessful: true,
      reason: 'Post-repair MNF returned to within 1.02x of historical baseline envelope',
    },
    version: 4,
  },
];

export class ValidatedJsonFixtureIncidentRepository implements IIncidentRepository {
  private inMemoryCache: Map<string, Incident>;

  constructor(seedFixtures: Incident[] = INITIAL_FIXTURE_INCIDENTS) {
    this.inMemoryCache = new Map();
    for (const fixture of seedFixtures) {
      this.inMemoryCache.set(fixture.incidentId, JSON.parse(JSON.stringify(fixture), (key, value) => {
        if (key.endsWith('At') && typeof value === 'string') {
          return new Date(value);
        }
        return value;
      }));
    }
  }

  async getById(id: string): Promise<Incident | undefined> {
    const item = this.inMemoryCache.get(id);
    return item ? { ...item } : undefined;
  }

  async getAll(): Promise<Incident[]> {
    return Array.from(this.inMemoryCache.values()).map((inc) => ({ ...inc }));
  }

  async getByDma(dmaId: string): Promise<Incident[]> {
    return Array.from(this.inMemoryCache.values())
      .filter((inc) => inc.dmaId === dmaId)
      .map((inc) => ({ ...inc }));
  }

  async save(incident: Incident): Promise<void> {
    if (this.inMemoryCache.has(incident.incidentId)) {
      throw new Error(`Fixture repository: Incident ${incident.incidentId} already exists`);
    }
    this.inMemoryCache.set(incident.incidentId, { ...incident });
  }

  async update(incident: Incident): Promise<void> {
    if (!this.inMemoryCache.has(incident.incidentId)) {
      throw new Error(`Fixture repository: Cannot update non-existent incident ${incident.incidentId}`);
    }
    this.inMemoryCache.set(incident.incidentId, { ...incident });
  }
}
