import { HEARTBEAT_STALE_MS } from '../domain/snapshot.js';
import { LEGACY_ORPHAN_AGE_MS } from './legacy-orphan-age.js';
import type { AuditQueue } from './ports/audit-queue.js';
import type { Clock } from './ports/clock.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';

/**
 * Gives back to the queue (or fails) the audits whose worker stopped sending heartbeats, and
 * fails the heartbeat-less `running` ones (in-process runner, `--direct`, pre-migration rows)
 * once old enough to be the orphan of a killed process.
 */
export class RecoverStaleAudits {
  constructor(
    private readonly queue: AuditQueue,
    private readonly snapshots: SnapshotRepository,
    private readonly clock: Clock,
  ) {}

  /** Returns how many audits were interrupted or failed. */
  async execute(): Promise<number> {
    const now = this.clock.now();
    const recovered = await this.queue.recoverStale(new Date(now), HEARTBEAT_STALE_MS);
    const orphans = await this.failLegacyOrphans(now);
    return recovered.length + orphans;
  }

  /** The 2-minute threshold must not apply here: a live `--direct` audit never sends heartbeats. */
  private async failLegacyOrphans(now: number): Promise<number> {
    const running = await this.snapshots.listRunning();
    const orphans = running.filter(
      (snapshot) =>
        snapshot.heartbeatAt === null && now - snapshot.startedAt.getTime() >= LEGACY_ORPHAN_AGE_MS,
    );
    for (const orphan of orphans) await this.snapshots.fail(orphan.id, new Date(now));
    return orphans.length;
  }
}
