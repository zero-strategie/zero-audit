import { describe, expect, it } from 'vitest';
import type { Crawler, CrawlerRequest } from '../../src/application/ports/crawler.js';
import { RunAudit } from '../../src/application/run-audit.js';
import { CheckRegistry } from '../../src/domain/check.js';
import type { CrawlResult } from '../../src/domain/crawl.js';
import { allChecks } from '../../src/domain/checks/index.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { makeLink, makePage } from '../support/check-fixtures.js';

const ROOT = 'https://exemple.com/';
const FIXED_NOW = 1_700_000_000_000;
const clock = { now: () => FIXED_NOW };

const crawlResult: CrawlResult = {
  rootUrl: ROOT,
  internalHost: 'exemple.com',
  pages: [makePage(ROOT), makePage('https://exemple.com/a')],
  blockedPages: [],
  links: [makeLink(ROOT, 'https://exemple.com/a')],
  siteFiles: [],
  site: { robotsFound: true, sitemapFound: true },
};

class FakeCrawler implements Crawler {
  readonly requests: CrawlerRequest[] = [];
  crawl(request: CrawlerRequest): Promise<CrawlResult> {
    this.requests.push(request);
    request.onProgress?.(2, request.limit);
    return Promise.resolve(crawlResult);
  }
}

const build = (crawler: Crawler) => {
  const repository = new InMemorySnapshotRepository();
  const projects = new InMemoryProjectRepository();
  const useCase = new RunAudit({
    crawler,
    repository,
    projects,
    registry: new CheckRegistry(allChecks),
    clock,
  });
  return { repository, projects, useCase };
};

const blocked = makePage('https://exemple.com/private/a', {
  blockedByRobots: true,
  status: null,
  isHtml: false,
});

describe('RunAudit', () => {
  it('stores blocked pages without counting them as crawled or examining them', async () => {
    const { useCase, repository } = build({
      crawl: () => Promise.resolve({ ...crawlResult, blockedPages: [blocked] }),
    });

    const details = await useCase.execute({ rootUrl: ROOT, limit: 10, delayMs: 0 });

    const stored = await repository.getById(details.snapshot.id);
    expect(stored?.pages).toHaveLength(3);
    expect(stored?.pages.filter((p) => p.blockedByRobots).map((p) => p.url)).toEqual([blocked.url]);
    expect(stored?.snapshot.pagesCrawled).toBe(2);
    const titleMissing = stored?.checkResults.find((r) => r.checkId === 3);
    expect(titleMissing?.examined).toBe(2);
  });

  it('persists pages, links and all check results, then finishes the snapshot', async () => {
    const crawler = new FakeCrawler();
    const { useCase, repository } = build(crawler);
    const progress: [number, number][] = [];
    let createdId = '';

    const details = await useCase.execute({
      rootUrl: ROOT,
      limit: 10,
      delayMs: 0,
      onProgress: (crawled, limit) => progress.push([crawled, limit]),
      onSnapshotCreated: (id) => (createdId = id),
    });

    const stored = await repository.getById(details.snapshot.id);
    expect(stored?.snapshot).toMatchObject({
      status: 'finished',
      pagesCrawled: 2,
      pagesLimit: 10,
    });
    expect(stored?.pages).toHaveLength(2);
    expect(stored?.links).toHaveLength(1);
    expect(stored?.checkResults).toHaveLength(allChecks.length);
    expect(details).toEqual(stored);
    expect(createdId).toBe(details.snapshot.id);
    expect(progress).toEqual([[2, 10]]);
    expect(crawler.requests[0]).toMatchObject({ rootUrl: ROOT, limit: 10, delayMs: 0 });
  });

  it('marks the snapshot failed and rethrows when the crawl throws', async () => {
    const boom = new Error('unexpected');
    const { useCase, repository } = build({ crawl: () => Promise.reject(boom) });
    let createdId = '';

    await expect(
      useCase.execute({
        rootUrl: ROOT,
        limit: 10,
        delayMs: 0,
        onSnapshotCreated: (id) => (createdId = id),
      }),
    ).rejects.toBe(boom);

    expect((await repository.getById(createdId))?.snapshot.status).toBe('failed');
  });

  describe('project resolution', () => {
    const audit = (useCase: RunAudit, rootUrl: string) =>
      useCase.execute({ rootUrl, limit: 10, delayMs: 0 });

    it('creates a project with the normalized root URL and attaches the snapshot to it', async () => {
      const { useCase, projects } = build(new FakeCrawler());

      const details = await audit(useCase, 'https://x.test');

      const [project] = await projects.list();
      expect(project).toMatchObject({ rootUrl: 'https://x.test/', createdAt: new Date(FIXED_NOW) });
      expect(details.snapshot.projectId).toBe(project?.id);
    });

    it('reuses the project of the same site', async () => {
      const { useCase, projects } = build(new FakeCrawler());

      const first = await audit(useCase, 'https://x.test');
      const second = await audit(useCase, 'https://x.test/');

      expect(second.snapshot.projectId).toBe(first.snapshot.projectId);
      expect(await projects.list()).toHaveLength(1);
    });

    it.each(['http://x.test/', 'https://www.x.test/'])(
      'creates a distinct project for %s',
      async (variant) => {
        const { useCase, projects } = build(new FakeCrawler());

        const base = await audit(useCase, 'https://x.test');
        const other = await audit(useCase, variant);

        expect(other.snapshot.projectId).not.toBe(base.snapshot.projectId);
        expect(await projects.list()).toHaveLength(2);
      },
    );
  });
});
