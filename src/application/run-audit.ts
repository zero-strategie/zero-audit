import type { CheckRegistry } from '../domain/check.js';
import { SnapshotNotFound } from '../domain/errors.js';
import type { Snapshot } from '../domain/snapshot.js';
import { normalizeUrl } from '../domain/url.js';
import type { AuditEvents } from './ports/audit-events.js';
import type { AuditQueue } from './ports/audit-queue.js';
import type { Clock } from './ports/clock.js';
import type { Crawler } from './ports/crawler.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { SnapshotDetails, SnapshotRepository } from './ports/snapshot-repository.js';
import { AttemptHeartbeat } from './attempt-heartbeat.js';
import { runChecks } from './run-checks.js';
import { healthOf } from './snapshot-health.js';

export interface RunAuditDependencies {
  crawler: Crawler;
  repository: SnapshotRepository;
  projects: ProjectRepository;
  registry: CheckRegistry;
  clock: Clock;
  events: AuditEvents;
}

export interface AuditRequest {
  rootUrl: string;
  limit: number;
  delayMs: number;
  /** The account owning the audited project; absent for the command line (showcase project). */
  ownerId?: string;
  /** The account behind an API launch; absent for the command line. */
  launchedBy?: string;
  onProgress?: (crawled: number, limit: number) => void;
  onSnapshotCreated?: (snapshotId: string) => void;
}

/** Thrown from the progress callback to abort a crawl whose worker is shutting down. */
export class AuditInterrupted extends Error {
  constructor() {
    super('Audit interrupted');
    this.name = 'AuditInterrupted';
  }
}

export interface ExistingAuditOptions {
  delayMs: number;
  /** Stops the crawl; once the crawl is over, the results are written whatever the signal. */
  signal: AbortSignal;
}

export class RunAudit {
  constructor(private readonly dependencies: RunAuditDependencies) {}

  async execute(request: AuditRequest): Promise<SnapshotDetails> {
    const { repository, projects, clock, events } = this.dependencies;
    const startedAt = new Date(clock.now());
    const project = await projects.findOrCreateByRootUrl({
      rootUrl: normalizeUrl(request.rootUrl),
      ownerId: request.ownerId ?? null,
      createdAt: startedAt,
    });
    const snapshot = await repository.create({
      projectId: project.id,
      launchedBy: request.launchedBy ?? null,
      pagesLimit: request.limit,
      startedAt,
    });
    request.onSnapshotCreated?.(snapshot.id);
    const identity = { snapshotId: snapshot.id, rootUrl: request.rootUrl };
    events.started(identity);
    try {
      const details = await this.crawlAndPersist(snapshot.id, request);
      events.finished({
        ...identity,
        pagesCount: details.snapshot.pagesCrawled,
        health: await healthOf(repository, details.snapshot),
      });
      return details;
    } catch (error) {
      await repository.fail(snapshot.id, new Date(clock.now()));
      events.failed(identity);
      throw error;
    }
  }

  /**
   * Runs an audit already claimed by a worker (its attempt is `snapshot.attempts`). Raises
   * `AuditInterrupted` on shutdown and `AuditAttemptLost` when another worker took the audit over;
   * any other error is the crawl's own, the caller fails the audit.
   */
  async runExisting(
    snapshot: Snapshot,
    queue: AuditQueue,
    { delayMs, signal }: ExistingAuditOptions,
  ): Promise<SnapshotDetails> {
    const { crawler, repository, projects, registry, clock } = this.dependencies;
    const project = await projects.getById(snapshot.projectId);
    if (!project) throw new SnapshotNotFound(snapshot.id);
    const heartbeat = new AttemptHeartbeat(queue, clock, snapshot);
    const crawl = await crawler.crawl({
      rootUrl: project.rootUrl,
      limit: snapshot.pagesLimit,
      delayMs,
      onProgress: (crawled) => {
        if (signal.aborted) throw new AuditInterrupted();
        heartbeat.onPage(crawled);
      },
    });
    await heartbeat.settle();
    // The rows below are not guarded by the attempt: check beforehand that it is still ours.
    await queue.heartbeat(
      snapshot.id,
      snapshot.attempts,
      crawl.pages.length,
      new Date(clock.now()),
    );
    await repository.addPages(snapshot.id, [...crawl.pages, ...crawl.blockedPages]);
    await repository.addLinks(snapshot.id, crawl.links);
    await repository.addSiteFiles(snapshot.id, crawl.siteFiles);
    if (crawl.hostProbe) await repository.addHostProbe(snapshot.id, crawl.hostProbe);
    await repository.addSlashProbes(snapshot.id, crawl.slashProbes);
    await repository.addCheckResults(snapshot.id, runChecks(crawl, registry));
    await queue.finishAttempt(snapshot.id, snapshot.attempts, {
      finishedAt: new Date(clock.now()),
      pagesCrawled: crawl.pages.length,
    });
    const details = await repository.getById(snapshot.id);
    if (!details) throw new SnapshotNotFound(snapshot.id);
    return details;
  }

  private async crawlAndPersist(
    snapshotId: string,
    request: AuditRequest,
  ): Promise<SnapshotDetails> {
    const { crawler, repository, registry, clock } = this.dependencies;
    const crawl = await crawler.crawl({
      rootUrl: request.rootUrl,
      limit: request.limit,
      delayMs: request.delayMs,
      ...(request.onProgress && { onProgress: request.onProgress }),
    });
    await repository.addPages(snapshotId, [...crawl.pages, ...crawl.blockedPages]);
    await repository.addLinks(snapshotId, crawl.links);
    await repository.addSiteFiles(snapshotId, crawl.siteFiles);
    if (crawl.hostProbe) await repository.addHostProbe(snapshotId, crawl.hostProbe);
    await repository.addSlashProbes(snapshotId, crawl.slashProbes);
    await repository.addCheckResults(snapshotId, runChecks(crawl, registry));
    await repository.finish(snapshotId, {
      finishedAt: new Date(clock.now()),
      pagesCrawled: crawl.pages.length,
    });
    const details = await repository.getById(snapshotId);
    if (!details) throw new SnapshotNotFound(snapshotId);
    return details;
  }
}
