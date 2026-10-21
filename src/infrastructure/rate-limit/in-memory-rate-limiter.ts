import type { Clock } from '../../application/ports/clock.js';
import type { RateLimiter } from '../../application/ports/rate-limiter.js';

interface Tracked {
  events: number[];
  /** Longest window requested for the key: after it, nothing of the key matters anymore. */
  windowMs: number;
}

/** Single-instance limiter: the API runs as one process, so memory is enough. */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly keys = new Map<string, Tracked>();

  constructor(private readonly clock: Clock) {}

  get trackedKeys(): number {
    return this.keys.size;
  }

  hit(key: string, windowMs: number): void {
    const now = this.clock.now();
    this.forgetExpired(now);
    const tracked = this.keys.get(key) ?? { events: [], windowMs };
    tracked.windowMs = Math.max(tracked.windowMs, windowMs);
    tracked.events = tracked.events.filter((at) => at > now - tracked.windowMs);
    tracked.events.push(now);
    this.keys.set(key, tracked);
  }

  isBlocked(key: string, limit: number, windowMs: number): boolean {
    const since = this.clock.now() - windowMs;
    const recent = this.keys.get(key)?.events.filter((at) => at > since) ?? [];
    return recent.length >= limit;
  }

  private forgetExpired(now: number): void {
    for (const [key, { events, windowMs }] of this.keys) {
      const newest = events.at(-1) ?? 0;
      if (newest <= now - windowMs) this.keys.delete(key);
    }
  }
}
