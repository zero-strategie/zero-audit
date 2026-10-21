import { HEARTBEAT_STALE_MS } from '../domain/snapshot.js';
import type { AuditQueue } from './ports/audit-queue.js';
import type { Clock } from './ports/clock.js';

/** Gives back to the queue (or fails) the audits whose worker stopped sending heartbeats. */
export class RecoverStaleAudits {
  constructor(
    private readonly queue: AuditQueue,
    private readonly clock: Clock,
  ) {}

  /** Returns how many audits were interrupted. */
  async execute(): Promise<number> {
    const recovered = await this.queue.recoverStale(new Date(this.clock.now()), HEARTBEAT_STALE_MS);
    return recovered.length;
  }
}
