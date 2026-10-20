import { ORPHAN_AUDIT_MAX_AGE_MS } from '../domain/snapshot.js';
import type { Clock } from './ports/clock.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';

/** Frees the audit lock left by a process that was killed mid-audit. */
export class FailOrphanedAudits {
  constructor(
    private readonly snapshots: SnapshotRepository,
    private readonly clock: Clock,
  ) {}

  /** Returns how many snapshots were marked failed. */
  async execute(): Promise<number> {
    const now = this.clock.now();
    const running = await this.snapshots.listRunning();
    const orphans = running.filter(
      (snapshot) => now - snapshot.startedAt.getTime() > ORPHAN_AUDIT_MAX_AGE_MS,
    );
    for (const orphan of orphans) await this.snapshots.fail(orphan.id, new Date(now));
    return orphans.length;
  }
}
