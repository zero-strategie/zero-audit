import type { CheckRegistry } from '../domain/check.js';
import { SnapshotNotFound } from '../domain/errors.js';
import { normalizeUrl } from '../domain/url.js';
import type { AuditEvents } from './ports/audit-events.js';
import type { Clock } from './ports/clock.js';
import type { Crawler } from './ports/crawler.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { SnapshotDetails, SnapshotRepository } from './ports/snapshot-repository.js';
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
