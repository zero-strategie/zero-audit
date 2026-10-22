import type { Clock } from '../../src/application/ports/clock.js';

export const NOW = new Date('2026-05-04T09:00:00.000Z');

export class MutableClock implements Clock {
  constructor(private current: Date = NOW) {}

  now(): number {
    return this.current.getTime();
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
