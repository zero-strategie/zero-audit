import type { CheckRegistry } from '../domain/check.js';
import { SnapshotNotFound } from '../domain/errors.js';
import { normalizeUrl } from '../domain/url.js';
import type { Clock } from './ports/clock.js';
import type { Crawler } from './ports/crawler.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { SnapshotDetails, SnapshotRepository } from './ports/snapshot-repository.js';
import { runChecks } from './run-checks.js';

export interface RunAuditDependencies {
  crawler: Crawler;
  repository: SnapshotRepository;
  projects: ProjectRepository;
  registry: CheckRegistry;
  clock: Clock;
}

export interface AuditRequest {
  rootUrl: string;
  limit: number;
  delayMs: number;
  onProgress?: (crawled: number, limit: number) => void;
  onSnapshotCreated?: (snapshotId: string) => void;
}

export class RunAudit {
  constructor(private readonly dependencies: RunAuditDependencies) {}

  async execute(request: AuditRequest): Promise<SnapshotDetails> {
    const { repository, projects, clock } = this.dependencies;
    const startedAt = new Date(clock.now());
    const project = await projects.findOrCreateByRootUrl({
      rootUrl: normalizeUrl(request.rootUrl),
      createdAt: startedAt,
    });
    const snapshot = await repository.create({
      projectId: project.id,
      pagesLimit: request.limit,
      startedAt,
    });
    request.onSnapshotCreated?.(snapshot.id);
    try {
      return await this.crawlAndPersist(snapshot.id, request);
    } catch (error) {
      await repository.fail(snapshot.id, new Date(clock.now()));
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
