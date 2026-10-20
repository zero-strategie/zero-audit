import type { CheckResult } from '../../domain/check.js';
import type { HostProbe, Link, Page, SiteFile, SlashVariantProbe } from '../../domain/crawl.js';
import type { Snapshot } from '../../domain/snapshot.js';

export interface SnapshotDetails {
  readonly snapshot: Snapshot;
  readonly pages: readonly Page[];
  readonly links: readonly Link[];
  readonly checkResults: readonly CheckResult[];
  /** Ordered by kind then URL; empty for snapshots recorded before site files existed. */
  readonly siteFiles: readonly SiteFile[];
  /** Null for snapshots without a probe (IP or localhost root, or recorded before it existed). */
  readonly hostProbe: HostProbe | null;
  /** Ordered by source page then URL; empty for snapshots recorded before slash probes existed. */
  readonly slashProbes: readonly SlashVariantProbe[];
}

/** Deliberately has no delete method: audit history is append-only. */
export interface SnapshotRepository {
  create(input: { projectId: string; pagesLimit: number; startedAt: Date }): Promise<Snapshot>;
  addPages(id: string, pages: readonly Page[]): Promise<void>;
  addLinks(id: string, links: readonly Link[]): Promise<void>;
  addSiteFiles(id: string, files: readonly SiteFile[]): Promise<void>;
  addHostProbe(id: string, probe: HostProbe): Promise<void>;
  addSlashProbes(id: string, probes: readonly SlashVariantProbe[]): Promise<void>;
  addCheckResults(id: string, results: readonly CheckResult[]): Promise<void>;
  finish(id: string, input: { finishedAt: Date; pagesCrawled: number }): Promise<void>;
  fail(id: string, finishedAt: Date): Promise<void>;
  getById(id: string): Promise<SnapshotDetails | null>;
  /** Most recent first, by `startedAt`. */
  listByProject(projectId: string): Promise<readonly Snapshot[]>;
  /** Snapshots still `running`, every project included, most recent first. */
  listRunning(): Promise<readonly Snapshot[]>;
  /** Latest `finished` snapshot of the project whose `startedAt` is strictly before the given date. */
  findPreviousFinished(projectId: string, beforeStartedAt: Date): Promise<Snapshot | null>;
}
