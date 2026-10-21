import { randomUUID } from 'node:crypto';
import type {
  SnapshotDetails,
  SnapshotRepository,
} from '../application/ports/snapshot-repository.js';
import type { Admission, AuditQueue } from '../application/ports/audit-queue.js';
import type { StorageHealth } from '../application/ports/storage-health.js';
import type { CheckResult } from '../domain/check.js';
import type { HostProbe, Link, Page, SiteFile, SlashVariantProbe } from '../domain/crawl.js';
import { AuditAttemptLost, SnapshotNotFound } from '../domain/errors.js';
import { Snapshot } from '../domain/snapshot.js';
import type { UserRepository } from '../application/ports/user-repository.js';
import { hashToken } from './hash-token.js';

interface Stored {
  snapshot: Snapshot;
  launchedBy: string | null;
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

export class InMemorySnapshotRepository implements SnapshotRepository, AuditQueue, StorageHealth {
  private readonly stored = new Map<string, Stored>();
  private readonly presences = new Map<string, Date>();
  private enqueuing: Promise<unknown> = Promise.resolve();
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
    await this.record(snapshot, launchedBy);
    return snapshot;
  }

  /** One at a time, like the transaction of the SQL adapters, so two requests cannot both be admitted. */
  enqueue(
    input: { projectId: string; launchedBy: string | null; pagesLimit: number; requestedAt: Date },
    admit: Admission,
  ): Promise<Snapshot> {
    const admitted = this.enqueuing.then(async () => {
      await admit(this);
      const { requestedAt, launchedBy, ...props } = input;
      const snapshot = Snapshot.enqueue({ id: randomUUID(), startedAt: requestedAt, ...props });
      await this.record(snapshot, launchedBy);
      return snapshot;
    });
    this.enqueuing = admitted.catch(() => undefined);
    return admitted;
  }

  claimNext(workerId: string, now: Date): Promise<Snapshot | null> {
    this.presences.set(workerId, now);
    const [next] = this.queuedInOrder();
    if (!next) return Promise.resolve(null);
    next.snapshot = next.snapshot.claim(now);
    return Promise.resolve(next.snapshot);
  }

  finishAttempt(
    id: string,
    attempt: number,
    input: { finishedAt: Date; pagesCrawled: number },
  ): Promise<void> {
    return this.writeAttempt(id, attempt, (entry) => {
      entry.snapshot = entry.snapshot.finish(input.finishedAt, input.pagesCrawled);
    });
  }

  heartbeat(id: string, attempt: number, pagesCrawled: number, now: Date): Promise<void> {
    return this.writeAttempt(id, attempt, (entry) => {
      entry.snapshot = entry.snapshot.beat(now, pagesCrawled);
    });
  }

  failAttempt(id: string, attempt: number, finishedAt: Date): Promise<void> {
    return this.writeAttempt(id, attempt, (entry) => {
      entry.snapshot = entry.snapshot.fail(finishedAt);
    });
  }

  async requeue(id: string, attempt: number, now: Date): Promise<Snapshot> {
    await this.writeAttempt(id, attempt, (entry) => {
      this.interrupt(entry, now);
    });
    return this.snapshotOf(id);
  }

  recoverStale(now: Date, staleAfterMs: number): Promise<readonly Snapshot[]> {
    const limit = now.getTime() - staleAfterMs;
    const stale = [...this.stored.values()].filter(
      ({ snapshot }) =>
        snapshot.status === 'running' &&
        snapshot.heartbeatAt !== null &&
        snapshot.heartbeatAt.getTime() < limit,
    );
    for (const entry of stale) this.interrupt(entry, now);
    return Promise.resolve(stale.map(({ snapshot }) => snapshot));
  }

  recordWorkerPresence(workerId: string, now: Date): Promise<void> {
    this.presences.set(workerId, now);
    return Promise.resolve();
  }

  getWorkerPresence(workerId: string): Promise<Date | null> {
    return Promise.resolve(this.presences.get(workerId) ?? null);
  }

  queuePosition(id: string): Promise<number | null> {
    const index = this.queuedInOrder().findIndex(({ snapshot }) => snapshot.id === id);
    return Promise.resolve(index === -1 ? null : index + 1);
  }

  countQueued(): Promise<number> {
    return Promise.resolve(this.queuedInOrder().length);
  }

  countActiveFor(userId: string): Promise<number> {
    const active = [...this.stored.values()].filter(
      ({ launchedBy, snapshot }) =>
        launchedBy === userId && (snapshot.status === 'queued' || snapshot.status === 'running'),
    );
    return Promise.resolve(active.length);
  }

  /** The rows written by the interrupted attempt go with it. */
  private interrupt(entry: Stored, now: Date): void {
    entry.snapshot = entry.snapshot.interrupt(now);
    entry.pages = [];
    entry.links = [];
    entry.checkResults = [];
    entry.siteFiles = [];
    entry.hostProbe = null;
    entry.slashProbes = [];
  }

  private snapshotOf(id: string): Snapshot {
    const entry = this.stored.get(id);
    if (!entry) throw new SnapshotNotFound(id);
    return entry.snapshot;
  }

  private async record(snapshot: Snapshot, launchedBy: string | null): Promise<void> {
    this.stored.set(snapshot.id, {
      snapshot,
      launchedBy,
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
  }

  private queuedInOrder(): Stored[] {
    return [...this.stored.values()]
      .filter(({ snapshot }) => snapshot.status === 'queued')
      .sort(
        (a, b) =>
          (a.snapshot.queuedAt?.getTime() ?? 0) - (b.snapshot.queuedAt?.getTime() ?? 0) ||
          compare(a.snapshot.id, b.snapshot.id),
      );
  }

  private writeAttempt(
    id: string,
    attempt: number,
    mutate: (entry: Stored) => void,
  ): Promise<void> {
    const entry = this.stored.get(id);
    if (entry?.snapshot.status !== 'running' || entry.snapshot.attempts !== attempt) {
      return Promise.reject(new AuditAttemptLost(id, attempt));
    }
    mutate(entry);
    return Promise.resolve();
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
