import { randomUUID } from 'node:crypto';
import type {
  SnapshotDetails,
  SnapshotRepository,
} from '../application/ports/snapshot-repository.js';
import type { StorageHealth } from '../application/ports/storage-health.js';
import type { CheckResult } from '../domain/check.js';
import type { HostProbe, Link, Page, SiteFile, SlashVariantProbe } from '../domain/crawl.js';
import { SnapshotNotFound } from '../domain/errors.js';
import { Snapshot } from '../domain/snapshot.js';
import type { UserRepository } from '../application/ports/user-repository.js';
import { hashToken } from './hash-token.js';

interface Stored {
  snapshot: Snapshot;
  pages: Page[];
  links: Link[];
  checkResults: CheckResult[];
  siteFiles: SiteFile[];
  hostProbe: HostProbe | null;
  slashProbes: SlashVariantProbe[];
}

const compare = (a: string, b: string): number => Number(a > b) - Number(a < b);

/** Same order as the SQL adapters (`ORDER BY source_page_url, url`). */
const bySlashProbeOrder = (a: SlashVariantProbe, b: SlashVariantProbe): number =>
  compare(a.sourcePageUrl, b.sourcePageUrl) || compare(a.url, b.url);

/** Same order as the SQL adapter (`ORDER BY kind, url`). */
const bySiteFileOrder = (a: SiteFile, b: SiteFile): number =>
  compare(a.kind, b.kind) || compare(a.url, b.url);

export class InMemorySnapshotRepository implements SnapshotRepository, StorageHealth {
  private readonly stored = new Map<string, Stored>();
  private readonly launchJournal: { id: string; emailHash: string; launchedAt: Date }[] = [];

  /**
   * With `users`, launches are journaled by e-mail address like the SQL adapters, so they survive
   * an account erasure; without, by account id, which is enough for tests that never erase.
   */
  constructor(private readonly users?: Pick<UserRepository, 'findById'>) {}

  ping(): Promise<void> {
    return Promise.resolve();
  }

  async create(input: {
    projectId: string;
    launchedBy: string | null;
    pagesLimit: number;
    startedAt: Date;
  }): Promise<Snapshot> {
    const { launchedBy, ...props } = input;
    const snapshot = Snapshot.start({ id: randomUUID(), ...props });
    this.stored.set(snapshot.id, {
      snapshot,
      pages: [],
      links: [],
      checkResults: [],
      siteFiles: [],
      hostProbe: null,
      slashProbes: [],
    });
    const emailHash = launchedBy === null ? null : await this.launchKeyOf(launchedBy);
    if (emailHash !== null) {
      this.launchJournal.push({ id: snapshot.id, emailHash, launchedAt: snapshot.startedAt });
    }
    return snapshot;
  }

  addPages(id: string, pages: readonly Page[]): Promise<void> {
    return this.write(id, (entry) => entry.pages.push(...pages));
  }

  addLinks(id: string, links: readonly Link[]): Promise<void> {
    return this.write(id, (entry) => entry.links.push(...links));
  }

  addSiteFiles(id: string, files: readonly SiteFile[]): Promise<void> {
    return this.write(id, (entry) => entry.siteFiles.push(...files));
  }

  addHostProbe(id: string, probe: HostProbe): Promise<void> {
    return this.write(id, (entry) => {
      entry.hostProbe = probe;
    });
  }

  addSlashProbes(id: string, probes: readonly SlashVariantProbe[]): Promise<void> {
    return this.write(id, (entry) => entry.slashProbes.push(...probes));
  }

  addCheckResults(id: string, results: readonly CheckResult[]): Promise<void> {
    return this.write(id, (entry) => entry.checkResults.push(...results));
  }

  finish(id: string, input: { finishedAt: Date; pagesCrawled: number }): Promise<void> {
    return this.write(id, (entry) => {
      entry.snapshot = entry.snapshot.finish(input.finishedAt, input.pagesCrawled);
    });
  }

  fail(id: string, finishedAt: Date): Promise<void> {
    return this.write(id, (entry) => {
      entry.snapshot = entry.snapshot.fail(finishedAt);
    });
  }

  getById(id: string): Promise<SnapshotDetails | null> {
    const entry = this.stored.get(id);
    if (!entry) return Promise.resolve(null);
    return Promise.resolve({
      snapshot: entry.snapshot,
      pages: [...entry.pages],
      links: [...entry.links],
      checkResults: [...entry.checkResults],
      siteFiles: [...entry.siteFiles].sort(bySiteFileOrder),
      hostProbe: entry.hostProbe,
      slashProbes: [...entry.slashProbes].sort(bySlashProbeOrder),
    });
  }

  async listLaunchedAtBy(userId: string, since: Date): Promise<readonly Date[]> {
    const emailHash = await this.launchKeyOf(userId);
    return this.launchedSince(since)
      .filter((launch) => launch.emailHash === emailHash)
      .map((launch) => launch.launchedAt)
      .sort((a, b) => a.getTime() - b.getTime());
  }

  countApiLaunchedSince(since: Date): Promise<number> {
    return Promise.resolve(this.launchedSince(since).length);
  }

  listByProject(projectId: string): Promise<readonly Snapshot[]> {
    const snapshots = [...this.stored.values()]
      .map(({ snapshot }) => snapshot)
      .filter((snapshot) => snapshot.projectId === projectId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return Promise.resolve(snapshots);
  }

  listRunning(): Promise<readonly Snapshot[]> {
    const snapshots = [...this.stored.values()]
      .map(({ snapshot }) => snapshot)
      .filter((snapshot) => snapshot.status === 'running')
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return Promise.resolve(snapshots);
  }

  async findPreviousFinished(projectId: string, beforeStartedAt: Date): Promise<Snapshot | null> {
    const snapshots = await this.listByProject(projectId);
    return (
      snapshots.find(
        (snapshot) =>
          snapshot.status === 'finished' &&
          snapshot.startedAt.getTime() < beforeStartedAt.getTime(),
      ) ?? null
    );
  }

  /** For `InMemoryAccountEraser` only: the port itself stays append-only. */
  eraseOfProjects(projectIds: readonly string[]): void {
    for (const [id, { snapshot }] of [...this.stored]) {
      if (projectIds.includes(snapshot.projectId)) this.stored.delete(id);
    }
  }

  /** For `InMemoryAccountEraser` only: returns how many entries were dropped. */
  purgeLaunchesBefore(date: Date): number {
    const kept = this.launchJournal.filter(({ launchedAt }) => launchedAt >= date);
    const dropped = this.launchJournal.length - kept.length;
    this.launchJournal.splice(0, this.launchJournal.length, ...kept);
    return dropped;
  }

  private async launchKeyOf(userId: string): Promise<string> {
    const user = await this.users?.findById(userId);
    return hashToken(user?.email ?? userId);
  }

  private launchedSince(since: Date): readonly { emailHash: string; launchedAt: Date }[] {
    return this.launchJournal.filter(({ launchedAt }) => launchedAt >= since);
  }

  private write(id: string, mutate: (entry: Stored) => void): Promise<void> {
    try {
      const entry = this.stored.get(id);
      if (!entry) throw new SnapshotNotFound(id);
      entry.snapshot.assertWritable();
      mutate(entry);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
