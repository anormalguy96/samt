import type { DbPool } from '../db/pool.js';
import type { AuditEvent } from '../../../prototype/src/domain/ports/AuditPort.js';
import type { AllocationPlanResult } from '../../../prototype/src/domain/allocation/constrainedAllocation.js';
import { generateId } from '../../../prototype/src/application/hashUtils.js';

export interface StoredAuditEvent extends AuditEvent {
  actorId: string;
  actorRole: string;
  correlationId: string;
}

export class PostgresAuditAndAllocationRepository {
  constructor(private pool: DbPool) {}

  async listAuditEvents(filter?: {
    dmaId?: string;
    incidentId?: string;
    limit?: number;
  }): Promise<StoredAuditEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.dmaId) {
      params.push(filter.dmaId);
      conditions.push(`dma_id = $${params.length}`);
    }
    if (filter?.incidentId) {
      params.push(filter.incidentId);
      conditions.push(`incident_id = $${params.length}`);
    }

    const limit = Math.min(200, Math.max(1, filter?.limit ?? 50));
    params.push(limit);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const res = await this.pool.query<{
      audit_id: string;
      event_timestamp: Date;
      event_type: string;
      source_component: string;
      severity: string;
      actor_id: string;
      actor_role: string;
      correlation_id: string;
      dma_id: string | null;
      incident_id: string | null;
      message: string;
      metadata: Record<string, unknown> | null;
    }>(
      `
      SELECT audit_id, event_timestamp, event_type, source_component, severity,
             actor_id, actor_role, correlation_id, dma_id, incident_id, message, metadata
      FROM audit_events
      ${where}
      ORDER BY event_timestamp DESC, audit_id ASC
      LIMIT $${params.length}
      `,
      params
    );

    return res.rows.map((r) => ({
      id: r.audit_id,
      timestamp: new Date(r.event_timestamp),
      eventType: r.event_type,
      sourceComponent: r.source_component,
      severity: r.severity as AuditEvent['severity'],
      actorId: r.actor_id,
      actorRole: r.actor_role,
      correlationId: r.correlation_id,
      dmaId: r.dma_id ?? undefined,
      incidentId: r.incident_id ?? undefined,
      message: r.message,
      metadata: r.metadata ?? undefined,
    }));
  }

  async saveAllocationRun(input: {
    regionId: string;
    canalNetworkId: string;
    actorId: string;
    correlationId: string;
    plan: AllocationPlanResult;
  }): Promise<string> {
    const runId = generateId('alloc');
    await this.pool.query(
      `
      INSERT INTO allocation_runs (
        run_id, region_id, canal_network_id, volume_unit, delivery_horizon_hours,
        total_supply, total_allocated, unmet_demand, residual_supply, gini_index,
        actor_id, correlation_id, result_payload
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `,
      [
        runId,
        input.regionId,
        input.canalNetworkId,
        input.plan.volumeUnit,
        input.plan.deliveryHorizonHours,
        input.plan.totalSupplyM3,
        input.plan.totalAllocatedM3,
        input.plan.unmetDemandM3,
        input.plan.residualSupplyM3,
        input.plan.giniIndex,
        input.actorId,
        input.correlationId,
        JSON.stringify(input.plan),
      ]
    );
    return runId;
  }
}
