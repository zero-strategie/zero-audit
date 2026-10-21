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
  finishAttempt(
    id: string,
    attempt: number,
    input: { finishedAt: Date; pagesCrawled: number },
  ): Promise<void>;
  /** 1 for the next audit to be claimed; null unless the audit is queued. */
  queuePosition(id: string): Promise<number | null>;
}
