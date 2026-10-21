import { HEARTBEAT_EVERY_MS, HEARTBEAT_EVERY_PAGES, type Snapshot } from '../domain/snapshot.js';
import type { AuditQueue } from './ports/audit-queue.js';
import type { Clock } from './ports/clock.js';

/**
 * The crawler's progress callback is synchronous, so the asynchronous heartbeat is started from it
 * and tracked here: a failed write (a lost attempt) is raised by the next `onPage`, or by `settle`.
 */
export class AttemptHeartbeat {
  private lastPages = 0;
  private lastAt: number;
  private pending: Promise<void> = Promise.resolve();
  private failure: Error | null = null;

  constructor(
    private readonly queue: AuditQueue,
    private readonly clock: Clock,
    private readonly snapshot: Snapshot,
  ) {
    this.lastAt = clock.now();
  }

  /** Throws when an earlier heartbeat was refused. */
  onPage(crawled: number): void {
    this.rethrow();
    const now = this.clock.now();
    const due =
      crawled - this.lastPages >= HEARTBEAT_EVERY_PAGES || now - this.lastAt >= HEARTBEAT_EVERY_MS;
    if (!due) return;
    this.lastPages = crawled;
    this.lastAt = now;
    this.pending = this.pending.then(() =>
      this.queue
        .heartbeat(this.snapshot.id, this.snapshot.attempts, crawled, new Date(now))
        .catch((error: unknown) => {
          this.failure ??= error instanceof Error ? error : new Error(String(error));
        }),
    );
  }

  /** Waits for the heartbeats in flight, then throws if one was refused. */
  async settle(): Promise<void> {
    await this.pending;
    this.rethrow();
  }

  private rethrow(): void {
    if (this.failure !== null) throw this.failure;
  }
}
