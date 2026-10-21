import { WORKER_HEALTH_MAX_AGE_MS } from '../domain/snapshot.js';
import type { AuditQueue } from './ports/audit-queue.js';
import type { Clock } from './ports/clock.js';

/** True when at least one of the worker identifiers announced itself less than a minute ago. */
export class CheckWorkerHealth {
  constructor(
    private readonly queue: Pick<AuditQueue, 'getWorkerPresence'>,
    private readonly clock: Clock,
  ) {}

  async execute(workerIds: readonly string[]): Promise<boolean> {
    const now = this.clock.now();
    const seenAt = await Promise.all(workerIds.map((id) => this.queue.getWorkerPresence(id)));
    return seenAt.some((date) => date !== null && now - date.getTime() < WORKER_HEALTH_MAX_AGE_MS);
  }
}
