/**
 * Clock Port (Lecture 5: Controllability & Observability)
 * Decouples domain time logic from system non-determinism (Date.now()).
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
    const parsed = new Date(initialTime);
    if (!Number.isFinite(parsed.getTime())) {
      throw new Error(`Invalid FixedClock initialTime: ${String(initialTime)}`);
    }
    this.currentTime = parsed;
  }

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  setTime(time: Date | string | number): void {
    const parsed = new Date(time);
    if (!Number.isFinite(parsed.getTime())) {
      throw new Error(`Invalid FixedClock time: ${String(time)}`);
    }
    this.currentTime = parsed;
  }

  advanceMinutes(minutes: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + minutes * 60 * 1000);
  }

  advanceSeconds(seconds: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + seconds * 1000);
  }
}
