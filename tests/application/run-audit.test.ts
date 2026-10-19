import { describe, expect, it } from 'vitest';
import type { Crawler, CrawlerRequest } from '../../src/application/ports/crawler.js';
import { RunAudit } from '../../src/application/run-audit.js';
import { CheckRegistry } from '../../src/domain/check.js';
import type { CrawlResult } from '../../src/domain/crawl.js';
import { allChecks } from '../../src/domain/checks/index.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { makeLink, makePage } from '../support/check-fixtures.js';

const ROOT = 'https://exemple.com/';
const FIXED_NOW = 1_700_000_000_000;
const clock = { now: () => FIXED_NOW };

const crawlResult: CrawlResult = {
  rootUrl: ROOT,
  internalHost: 'exemple.com',
  pages: [makePage(ROOT), makePage('https://exemple.com/a')],
  links: [makeLink(ROOT, 'https://exemple.com/a')],
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
  const useCase = new RunAudit({
    crawler,
    repository,
    registry: new CheckRegistry(allChecks),
    clock,
  });
  return { repository, useCase };
};

describe('RunAudit', () => {
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
});
