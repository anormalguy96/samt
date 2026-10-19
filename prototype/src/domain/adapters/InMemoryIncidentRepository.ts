/**
 * In-Memory Incident Repository Adapter (Lecture 4: Hexagonal Ports & Adapters)
 * High-performance, framework-independent Map-based implementation.
 * Provides real read/write capabilities for fast automated test suites and client simulations.
 */

import type { Incident, IIncidentRepository } from '../ports/IncidentPort';

export class InMemoryIncidentRepository implements IIncidentRepository {
  private store = new Map<string, Incident>();

  constructor(initialIncidents: Incident[] = []) {
    for (const inc of initialIncidents) {
      this.store.set(inc.incidentId, { ...inc });
    }
  }

  async getById(id: string): Promise<Incident | undefined> {
    const found = this.store.get(id);
    return found ? { ...found } : undefined;
  }

  async getAll(): Promise<Incident[]> {
    return Array.from(this.store.values()).map((inc) => ({ ...inc }));
  }

  async getByDma(dmaId: string): Promise<Incident[]> {
    return Array.from(this.store.values())
      .filter((inc) => inc.dmaId === dmaId)
      .map((inc) => ({ ...inc }));
  }

  async save(incident: Incident): Promise<void> {
    if (this.store.has(incident.incidentId)) {
      throw new Error(`Incident with ID ${incident.incidentId} already exists in repository`);
    }
    this.store.set(incident.incidentId, { ...incident });
  }

  async update(incident: Incident): Promise<void> {
    const existing = this.store.get(incident.incidentId);
    if (!existing) {
      throw new Error(`Cannot update non-existent incident with ID ${incident.incidentId}`);
    }
    // Optimistic concurrency check
    if (existing.version !== incident.version - 1 && existing.version !== incident.version) {
      throw new Error(
        `Optimistic concurrency conflict on incident ${incident.incidentId}: expected v${existing.version}, received v${incident.version}`
      );
    }
    this.store.set(incident.incidentId, { ...incident });
  }

  clear(): void {
    this.store.clear();
  }
}
