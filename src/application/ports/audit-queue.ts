import type { Snapshot } from '../../domain/snapshot.js';

/**
 * What an admission rule may read. Inside the real adapters it runs in the very transaction that
 * records the audit, so two concurrent requests cannot both pass a limit that only allows one.
 */
export interface AdmissionView {
  listLaunchedAtBy(userId: string, since: Date): Promise<readonly Date[]>;
  countApiLaunchedSince(since: Date): Promise<number>;
  countActiveFor(userId: string): Promise<number>;
  countQueued(): Promise<number>;
}

/** Throws to refuse the audit; the error reaches the caller of `enqueue` unchanged. */
export type Admission = (view: AdmissionView) => Promise<void>;

export interface AuditQueue extends AdmissionView {
  /** `launchedBy` is the account behind an API launch; null for the CLI. */
  enqueue(
    input: { projectId: string; launchedBy: string | null; pagesLimit: number; requestedAt: Date },
    admit: Admission,
  ): Promise<Snapshot>;
  /** Oldest queued audit first. It becomes `running` with one more attempt; null when the queue is empty. */
  claimNext(workerId: string, now: Date): Promise<Snapshot | null>;
  /**
   * The next four writes belong to one attempt: they throw `AuditAttemptLost` when the audit is no
   * longer running at that attempt (a recovered audit whose former worker still writes).
   */
  heartbeat(id: string, attempt: number, pagesCrawled: number, now: Date): Promise<void>;
  finishAttempt(
    id: string,
    attempt: number,
    input: { finishedAt: Date; pagesCrawled: number },
  ): Promise<void>;
  failAttempt(id: string, attempt: number, finishedAt: Date): Promise<void>;
  /**
   * Gives the attempt up: back to the queue with its original place, or `failed` when every
   * attempt is spent. The rows written by the attempt are deleted.
   */
  requeue(id: string, attempt: number, now: Date): Promise<Snapshot>;
  /** Interrupts the `running` audits whose heartbeat is older than `staleAfterMs`; returns them as they are now. */
  recoverStale(now: Date, staleAfterMs: number): Promise<readonly Snapshot[]>;
  /** 1 for the next audit to be claimed; null unless the audit is queued. */
  queuePosition(id: string): Promise<number | null>;
  recordWorkerPresence(workerId: string, now: Date): Promise<void>;
  getWorkerPresence(workerId: string): Promise<Date | null>;
}
