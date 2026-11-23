/**
 * Recording Audit Sink & Notifier Spy (Lecture 5: Test Doubles & Observability)
 * Records domain audit events and dispatches in memory for deterministic testing.
 */

import type { AuditEvent, IAuditSink, INotifier } from '../ports/AuditPort.js';
import type { Clock } from '../ports/Clock.js';
import { SystemClock } from '../ports/Clock.js';

export interface RecordedNotification {
  recipient: string;
  message: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  timestamp: Date;
}

export class RecordingAuditSink implements IAuditSink, INotifier {
  private events: AuditEvent[] = [];
  private notifications: RecordedNotification[] = [];

  constructor(private clock: Clock = new SystemClock()) {}

  record(event: AuditEvent): void {
    this.events.push({
      ...event,
      timestamp: new Date(event.timestamp.getTime()),
      metadata: event.metadata ? structuredClone(event.metadata) : undefined,
    });
  }

  getEvents(): AuditEvent[] {
    return this.events.map((e) => ({
      ...e,
      timestamp: new Date(e.timestamp.getTime()),
      metadata: e.metadata ? structuredClone(e.metadata) : undefined,
    }));
  }

  getEventsByType(eventType: string): AuditEvent[] {
    return this.getEvents().filter((e) => e.eventType === eventType);
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
      timestamp: this.clock.now(),
    });
    return true;
  }

  getNotifications(): RecordedNotification[] {
    return this.notifications.map((n) => ({
      ...n,
      timestamp: new Date(n.timestamp.getTime()),
    }));
  }

  clear(): void {
    this.events = [];
    this.notifications = [];
  }
}
