/**
 * Audit & Notification Ports (Lectures 4 & 5: Information Hiding & Test Doubles)
 * Provides clean seams for recording domain state transitions and alerts.
 */

export interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: string;
  sourceComponent: string;
  severity: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
  actorId?: string;
  actorRole?: string;
  correlationId?: string;
  dmaId?: string;
  incidentId?: string;
  metadata?: Record<string, unknown>;
}

export interface IAuditSink {
  record(event: AuditEvent): void;
  getEvents(): AuditEvent[];
  clear(): void;
}

export interface INotifier {
  notify(recipient: string, message: string, severity: 'INFO' | 'WARN' | 'CRITICAL'): Promise<boolean>;
}
