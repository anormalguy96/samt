/**
 * Clock Port (Lecture 5: Controllability & Observability)
 * Decouples domain time logic from system non-determinism (Date.now()).
 * Allows automated test suites and time-travel controls to test night-flow (02:00-04:00 AM)
 * deterministically during daylight laboratory hours.
 */

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  private currentTime: Date;

  constructor(initialTime: Date | string | number = '2026-10-20T03:00:00+04:00') {
    this.currentTime = new Date(initialTime);
  }

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  setTime(time: Date | string | number): void {
    this.currentTime = new Date(time);
  }

  advanceMinutes(minutes: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + minutes * 60 * 1000);
  }

  advanceSeconds(seconds: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + seconds * 1000);
  }
}
