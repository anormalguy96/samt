/**
 * Recording Audit Sink & Notifier Spy (Lecture 5: Test Doubles & Observability)
 * Records all domain audit events and dispatches in memory.
 * Enables automated test suites to assert that exact expected events were emitted.
 */

import type { AuditEvent, IAuditSink, INotifier } from '../ports/AuditPort';

export interface RecordedNotification {
  recipient: string;
  message: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  timestamp: Date;
}

export class RecordingAuditSink implements IAuditSink, INotifier {
  private events: AuditEvent[] = [];
  private notifications: RecordedNotification[] = [];

  record(event: AuditEvent): void {
    this.events.push({ ...event });
  }

  getEvents(): AuditEvent[] {
    return [...this.events];
  }

  getEventsByType(eventType: string): AuditEvent[] {
    return this.events.filter((e) => e.eventType === eventType);
  }

  async notify(
    recipient: string,
    message: string,
    severity: 'INFO' | 'WARN' | 'CRITICAL'
  ): Promise<boolean> {
    this.notifications.push({
      recipient,
      message,
      severity,
      timestamp: new Date(),
    });
    return true;
  }

  getNotifications(): RecordedNotification[] {
    return [...this.notifications];
  }

  clear(): void {
    this.events = [];
    this.notifications = [];
  }
}
