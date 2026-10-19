import type { CheckResult } from '../../domain/check.js';
import type { Link, Page } from '../../domain/crawl.js';
import type { Snapshot } from '../../domain/snapshot.js';

export interface SnapshotDetails {
  readonly snapshot: Snapshot;
  readonly pages: readonly Page[];
  readonly links: readonly Link[];
  readonly checkResults: readonly CheckResult[];
}

/** Deliberately has no delete method: audit history is append-only. */
export interface SnapshotRepository {
  create(input: { projectId: string; pagesLimit: number; startedAt: Date }): Promise<Snapshot>;
  addPages(id: string, pages: readonly Page[]): Promise<void>;
  addLinks(id: string, links: readonly Link[]): Promise<void>;
  addCheckResults(id: string, results: readonly CheckResult[]): Promise<void>;
  finish(id: string, input: { finishedAt: Date; pagesCrawled: number }): Promise<void>;
  fail(id: string, finishedAt: Date): Promise<void>;
  getById(id: string): Promise<SnapshotDetails | null>;
  /** Most recent first, by `startedAt`. */
  listByProject(projectId: string): Promise<readonly Snapshot[]>;
  /** Latest `finished` snapshot of the project whose `startedAt` is strictly before the given date. */
  findPreviousFinished(projectId: string, beforeStartedAt: Date): Promise<Snapshot | null>;
}
