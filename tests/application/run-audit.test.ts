import { describe, expect, it } from 'vitest';
import type { AuditEvents } from '../../src/application/ports/audit-events.js';
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
  siteFiles: [
    { kind: 'robots', url: `${ROOT}robots.txt`, status: 200, error: null },
    { kind: 'llms', url: `${ROOT}llms.txt`, status: null, error: 'connection' },
  ],
  hostProbe: {
    url: 'https://www.exemple.com/',
    status: 200,
    error: null,
    isHtml: true,
    canonical: null,
  },
  slashProbes: [
    {
      url: 'https://exemple.com/a/',
      sourcePageUrl: 'https://exemple.com/a',
      status: 200,
      error: null,
      isHtml: true,
      canonical: null,
    },
  ],
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

class RecordingEvents implements AuditEvents {
  readonly calls: string[] = [];
  readonly payloads: unknown[] = [];
  started(event: unknown): void {
    this.calls.push('started');
    this.payloads.push(event);
  }
  finished(event: unknown): void {
    this.calls.push('finished');
    this.payloads.push(event);
  }
  failed(event: unknown): void {
    this.calls.push('failed');
    this.payloads.push(event);
  }
}

const build = (crawler: Crawler, events: AuditEvents = new RecordingEvents()) => {
  const repository = new InMemorySnapshotRepository();
  const projects = new InMemoryProjectRepository();
  const useCase = new RunAudit({
    crawler,
    repository,
    projects,
    registry: new CheckRegistry(allChecks),
    clock,
    events,
  });
  return { repository, projects, useCase };
};

const blocked = makePage('https://exemple.com/private/a', {
  blockedByRobots: true,
  status: null,
  isHtml: false,
});

describe('RunAudit events', () => {
  it('emits started then finished with the page count and the health', async () => {
    const events = new RecordingEvents();
    const { useCase } = build(new FakeCrawler(), events);

    const details = await useCase.execute({ rootUrl: ROOT, limit: 10, delayMs: 0 });

    expect(events.calls).toEqual(['started', 'finished']);
    expect(events.payloads).toEqual([
      { snapshotId: details.snapshot.id, rootUrl: ROOT },
      {
        snapshotId: details.snapshot.id,
        rootUrl: ROOT,
        pagesCount: 2,
        health: expect.any(Number) as number,
      },
    ]);
  });

  it('emits started then failed when the crawler throws', async () => {
    const events = new RecordingEvents();
    const failing: Crawler = { crawl: () => Promise.reject(new Error('boom')) };
    const { useCase } = build(failing, events);

    await expect(useCase.execute({ rootUrl: ROOT, limit: 10, delayMs: 0 })).rejects.toThrow('boom');

    expect(events.calls).toEqual(['started', 'failed']);
    expect(events.payloads[1]).toEqual({ snapshotId: expect.any(String) as string, rootUrl: ROOT });
  });
});

describe('RunAudit ownership', () => {
  const EPOCH = new Date(0);

  it('keeps the project of the showcase and the launches of the command line without owner', async () => {
    const { useCase, repository, projects } = build(new FakeCrawler());

    const { snapshot } = await useCase.execute({ rootUrl: ROOT, limit: 10, delayMs: 0 });

    expect((await projects.getById(snapshot.projectId))?.ownerId).toBeNull();
    expect(await repository.countApiLaunchedSince(EPOCH)).toBe(0);
  });

  it('audits into a project of the account and records it as the launcher, leaving the showcase alone', async () => {
    const { useCase, repository, projects } = build(new FakeCrawler());
    const showcase = await projects.findOrCreateByRootUrl({
      rootUrl: ROOT,
      ownerId: null,
      createdAt: new Date(FIXED_NOW),
    });

    const { snapshot } = await useCase.execute({
      rootUrl: ROOT,
      limit: 10,
      delayMs: 0,
      ownerId: 'u1',
      launchedBy: 'u1',
    });

    const project = await projects.getById(snapshot.projectId);
    expect(project?.ownerId).toBe('u1');
    expect(project?.id).not.toBe(showcase.id);
    expect(await repository.listLaunchedAtBy('u1', EPOCH)).toHaveLength(1);
    expect(await repository.listByProject(showcase.id)).toEqual([]);
    expect((await projects.list(null)).map(({ id }) => id)).toEqual([showcase.id]);
  });

  it('reuses the project of the account on the next audit', async () => {
    const { useCase } = build(new FakeCrawler());
    const request = { rootUrl: ROOT, limit: 10, delayMs: 0, ownerId: 'u1', launchedBy: 'u1' };

    const first = await useCase.execute(request);
    const second = await useCase.execute(request);

    expect(second.snapshot.projectId).toBe(first.snapshot.projectId);
  });
});

describe('RunAudit', () => {
  it('stores the technical files without counting them as crawled pages', async () => {
    const { useCase, repository } = build(new FakeCrawler());

    const details = await useCase.execute({ rootUrl: ROOT, limit: 10, delayMs: 0 });

    const stored = await repository.getById(details.snapshot.id);
    expect(stored?.siteFiles).toEqual(crawlResult.siteFiles.toReversed());
    expect(stored?.snapshot.status).toBe('finished');
    expect(stored?.snapshot.pagesCrawled).toBe(2);
    expect(stored?.pages.map(({ url }) => url)).toEqual([ROOT, 'https://exemple.com/a']);
  });

  it('stores the alternate host probe so that check 1000 can be recomputed', async () => {
    const { useCase, repository } = build(new FakeCrawler());

    const details = await useCase.execute({ rootUrl: ROOT, limit: 10, delayMs: 0 });

    expect((await repository.getById(details.snapshot.id))?.hostProbe).toEqual(
      crawlResult.hostProbe,
    );
  });

  it('stores the slash probes so that check 1000 can be recomputed', async () => {
    const { useCase, repository } = build(new FakeCrawler());

    const details = await useCase.execute({ rootUrl: ROOT, limit: 10, delayMs: 0 });

    expect((await repository.getById(details.snapshot.id))?.slashProbes).toEqual(
      crawlResult.slashProbes,
    );
  });

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

      const [project] = await projects.list(null);
      expect(project).toMatchObject({ rootUrl: 'https://x.test/', createdAt: new Date(FIXED_NOW) });
      expect(details.snapshot.projectId).toBe(project?.id);
    });

    it('reuses the project of the same site', async () => {
      const { useCase, projects } = build(new FakeCrawler());

      const first = await audit(useCase, 'https://x.test');
      const second = await audit(useCase, 'https://x.test/');

      expect(second.snapshot.projectId).toBe(first.snapshot.projectId);
      expect(await projects.list(null)).toHaveLength(1);
    });

    it.each(['http://x.test/', 'https://www.x.test/'])(
      'creates a distinct project for %s',
      async (variant) => {
        const { useCase, projects } = build(new FakeCrawler());

        const base = await audit(useCase, 'https://x.test');
        const other = await audit(useCase, variant);

        expect(other.snapshot.projectId).not.toBe(base.snapshot.projectId);
        expect(await projects.list(null)).toHaveLength(2);
      },
    );
  });
});
