import { AuditAttemptLost } from '../domain/errors.js';
import {
  EMPTY_QUEUE_POLL_MS,
  RECOVERY_EVERY_MS,
  WORKER_PRESENCE_EVERY_MS,
  type Snapshot,
  type SnapshotStatus,
} from '../domain/snapshot.js';
import type { AuditQueue } from './ports/audit-queue.js';
import type { Clock } from './ports/clock.js';
import type { Logger } from './ports/logger.js';
import type { Sleeper } from './ports/sleeper.js';
import { AuditInterrupted, type RunAudit } from './run-audit.js';
import type { RecoverStaleAudits } from './recover-stale-audits.js';

export interface ProcessAuditQueueDependencies {
  queue: AuditQueue;
  runAudit: Pick<RunAudit, 'runExisting'>;
  recover: Pick<RecoverStaleAudits, 'execute'>;
  clock: Clock;
  sleeper: Sleeper;
  /** Only the snapshot identifier, status, attempt and duration are ever logged. */
  logger: Logger;
  hostname: string;
  /** Audits processed in parallel; above 1 the worker identifiers are suffixed `-1`, `-2`... */
  concurrency: number;
  delayMs: number;
}

/** The presence identifiers of a worker process: the host name, suffixed per lane above one lane. */
export const workerIdsFor = (hostname: string, concurrency: number): string[] => {
  if (concurrency <= 1) return [hostname];
  return Array.from({ length: concurrency }, (_, index) => `${hostname}-${String(index + 1)}`);
};

type Outcome = SnapshotStatus | 'abandoned';

/** The worker: claims queued audits and runs them until the signal fires. */
export class ProcessAuditQueue {
  constructor(private readonly dependencies: ProcessAuditQueueDependencies) {}

  async run(signal: AbortSignal): Promise<void> {
    const { queue, clock, recover } = this.dependencies;
    const lanes = this.workerIds().flatMap((workerId) => [
      this.every(WORKER_PRESENCE_EVERY_MS, signal, () =>
        queue.recordWorkerPresence(workerId, new Date(clock.now())),
      ),
      this.work(workerId, signal),
    ]);
    await Promise.all([
      this.every(RECOVERY_EVERY_MS, signal, async () => {
        await recover.execute();
      }),
      ...lanes,
    ]);
  }

  private workerIds(): string[] {
    const { hostname, concurrency } = this.dependencies;
    return workerIdsFor(hostname, concurrency);
  }

  /** Runs the task now, then after every interval; a failing task is logged by name and retried. */
  private async every(
    intervalMs: number,
    signal: AbortSignal,
    task: () => Promise<void>,
  ): Promise<void> {
    while (!signal.aborted) {
      await this.tolerating(task);
      await this.dependencies.sleeper.sleep(intervalMs, signal);
    }
  }

  private async work(workerId: string, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const snapshot = await this.claim(workerId);
      if (snapshot) await this.tolerating(() => this.process(snapshot, signal));
      else await this.dependencies.sleeper.sleep(EMPTY_QUEUE_POLL_MS, signal);
    }
  }

  /** A storage hiccup counts as an empty queue: the worker logs it and polls again. */
  private async claim(workerId: string): Promise<Snapshot | null> {
    const { queue, clock, logger } = this.dependencies;
    try {
      return await queue.claimNext(workerId, new Date(clock.now()));
    } catch (error) {
      logger.error(`worker task failed: ${errorName(error)}`);
      return null;
    }
  }

  private async tolerating(task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (error) {
      this.dependencies.logger.error(`worker task failed: ${errorName(error)}`);
    }
  }

  private async process(snapshot: Snapshot, signal: AbortSignal): Promise<void> {
    const { queue, runAudit, clock, delayMs, logger } = this.dependencies;
    const startedAt = clock.now();
    let outcome: Outcome;
    try {
      await runAudit.runExisting(snapshot, queue, { delayMs, signal });
      outcome = 'finished';
    } catch (error) {
      outcome = await this.settle(snapshot, error);
    }
    const duration = clock.now() - startedAt;
    logger.info(
      `audit ${snapshot.id} status=${outcome} attempt=${String(snapshot.attempts)} durationMs=${String(duration)}`,
    );
  }

  /** Decides what the audit becomes after its run threw. */
  private async settle(snapshot: Snapshot, error: unknown): Promise<Outcome> {
    const { queue, clock } = this.dependencies;
    const now = new Date(clock.now());
    try {
      if (error instanceof AuditInterrupted) {
        return (await queue.requeue(snapshot.id, snapshot.attempts, now)).status;
      }
      if (error instanceof AuditAttemptLost) return 'abandoned';
      await queue.failAttempt(snapshot.id, snapshot.attempts, now);
      return 'failed';
    } catch (writeError) {
      if (writeError instanceof AuditAttemptLost) return 'abandoned';
      throw writeError;
    }
  }
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');
