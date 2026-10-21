import { describe, expect, it } from 'vitest';
import type { ProjectRepository } from '../../src/application/ports/project-repository.js';
import type { UserRepository } from '../../src/application/ports/user-repository.js';
import type { AuditQueue } from '../../src/application/ports/audit-queue.js';
import type { SnapshotRepository } from '../../src/application/ports/snapshot-repository.js';
import type { CheckResult } from '../../src/domain/check.js';
import type { HostProbe, Link, Page, SiteFile, SlashVariantProbe } from '../../src/domain/crawl.js';
import { check1000 } from '../../src/domain/checks/site/check-1000-url-variants.js';
import { crawlOf } from './check-fixtures.js';
import { SnapshotImmutable, SnapshotNotFound } from '../../src/domain/errors.js';

const startedAt = new Date('2026-01-01T10:00:00.000Z');
const finishedAt = new Date('2026-01-01T10:05:00.000Z');

const page = (overrides: Partial<Page> = {}): Page => ({
  url: 'https://example.test/',
  depth: 0,
  status: 200,
  error: null,
  redirectTarget: null,
  redirectChain: [],
  headers: {},
  responseTimeMs: 12,
  contentType: 'text/html',
  isHtml: true,
  title: 'Home',
  metaDescription: 'A description',
  canonical: 'https://example.test/home',
  h1: ['Home'],
  wordCount: 250,
  textRatio: 0.0734,
  contentHash: 'abc123',
  blockedByRobots: false,
  ...overrides,
});

const link: Link = {
  sourceUrl: 'https://example.test/',
  targetUrl: 'https://example.test/about',
  type: 'internal',
  rel: 'nofollow',
  anchor: 'About',
};

const checkResult = (overrides: Partial<CheckResult> = {}): CheckResult => ({
  checkId: 3,
  severity: 'error',
  theme: 'on-page',
  count: 1,
  examined: 5,
  occurrences: [{ checkId: 3, pageUrl: 'https://example.test/', info: { length: 12 } }],
  ...overrides,
});

const slashProbe = (overrides: Partial<SlashVariantProbe> = {}): SlashVariantProbe => ({
  url: 'https://example.test/about/',
  sourcePageUrl: 'https://example.test/about',
  status: 200,
  error: null,
  isHtml: true,
  canonical: null,
  ...overrides,
});

export interface RepositoryPair {
  readonly snapshots: SnapshotRepository & AuditQueue;
  readonly projects: ProjectRepository;
  readonly users: UserRepository;
}

export const describeSnapshotRepositoryContract = (
  factory: () => Promise<RepositoryPair> | RepositoryPair,
): void => {
  describe('SnapshotRepository contract', () => {
    const createRunning = async (): Promise<{
      repo: SnapshotRepository;
      projectId: string;
      id: string;
    }> => {
      const { snapshots: repo, projects } = await factory();
      const project = await projects.findOrCreateByRootUrl({
        rootUrl: 'https://example.test/',
        ownerId: null,
        createdAt: startedAt,
      });
      const snapshot = await repo.create({
        launchedBy: null,
        projectId: project.id,
        pagesLimit: 100,
        startedAt,
      });
      return { repo, projectId: project.id, id: snapshot.id };
    };

    it('creates a running snapshot with its limit', async () => {
      const { repo, id, projectId } = await createRunning();
      const details = await repo.getById(id);
      expect(details?.snapshot).toMatchObject({
        id,
        projectId,
        status: 'running',
        startedAt,
        finishedAt: null,
        pagesLimit: 100,
      });
    });

    it('returns null for an unknown id', async () => {
      const { snapshots: repo } = await factory();
      expect(await repo.getById('missing')).toBeNull();
    });

    it('keeps the blocked-by-robots flag of a page', async () => {
      const { repo, id } = await createRunning();
      const blocked = page({
        url: 'https://example.test/private',
        status: null,
        isHtml: false,
        blockedByRobots: true,
      });
      await repo.addPages(id, [page(), blocked]);

      const details = await repo.getById(id);

      expect(details?.pages.map((p) => p.blockedByRobots)).toEqual([false, true]);
    });

    it('reads back exactly what was written', async () => {
      const { repo, id } = await createRunning();
      const pages = [
        page(),
        page({
          url: 'https://example.test/down',
          status: null,
          error: 'ECONNRESET',
          isHtml: false,
          contentType: null,
          title: null,
          metaDescription: null,
          h1: [],
          wordCount: null,
          textRatio: null,
          contentHash: null,
        }),
        page({
          url: 'https://example.test/old',
          status: 301,
          redirectTarget: 'https://example.test/new',
          redirectChain: ['https://example.test/old', 'https://example.test/new'],
        }),
        page({
          url: 'https://example.test/two-h1',
          h1: ['One', 'Two'],
          headers: { 'content-type': 'text/html', 'cache-control': 'no-store' },
        }),
      ];
      const results = [
        checkResult(),
        checkResult({
          checkId: 4,
          severity: 'notice',
          occurrences: [{ checkId: 4, pageUrl: null, info: {} }],
        }),
      ];

      await repo.addPages(id, pages);
      await repo.addLinks(id, [link]);
      await repo.addCheckResults(id, results);

      const details = await repo.getById(id);
      expect(details?.pages).toEqual(pages);
      expect(details?.links).toEqual([link]);
      expect(details?.checkResults).toEqual(results);
    });

    it('reads back an empty list of site files when none was written', async () => {
      const { repo, id } = await createRunning();
      expect((await repo.getById(id))?.siteFiles).toEqual([]);
    });

    it('reads back site files unchanged and in a stable order', async () => {
      const { repo, id } = await createRunning();
      const robots: SiteFile = {
        kind: 'robots',
        url: 'https://example.test/robots.txt',
        status: 200,
        error: null,
      };
      const sitemapB: SiteFile = {
        kind: 'sitemap',
        url: 'https://example.test/b.xml',
        status: 404,
        error: null,
      };
      const sitemapA: SiteFile = { ...sitemapB, url: 'https://example.test/a.xml', status: 200 };
      const llms: SiteFile = {
        kind: 'llms',
        url: 'https://example.test/llms.txt',
        status: null,
        error: 'connection',
      };

      await repo.addSiteFiles(id, [sitemapB, robots, llms, sitemapA]);

      expect((await repo.getById(id))?.siteFiles).toEqual([llms, robots, sitemapA, sitemapB]);
    });

    it('reads back no host probe when none was written', async () => {
      const { repo, id } = await createRunning();
      expect((await repo.getById(id))?.hostProbe).toBeNull();
    });

    it.each<HostProbe>([
      {
        url: 'https://www.example.test/',
        status: 200,
        error: null,
        isHtml: true,
        canonical: 'https://www.example.test/',
      },
      {
        url: 'https://www.example.test/',
        status: null,
        error: 'dns',
        isHtml: false,
        canonical: null,
      },
    ])('reads back the host probe unchanged', async (probe) => {
      const { repo, id } = await createRunning();
      await repo.addHostProbe(id, probe);
      expect((await repo.getById(id))?.hostProbe).toEqual(probe);
    });

    it('reads back no slash probe when none was written', async () => {
      const { repo, id } = await createRunning();
      expect((await repo.getById(id))?.slashProbes).toEqual([]);
    });

    it('reads back slash probes unchanged, ordered by source page then url', async () => {
      const { repo, id } = await createRunning();
      const failed = slashProbe({
        url: 'https://example.test/blog',
        sourcePageUrl: 'https://example.test/blog/',
        status: null,
        error: 'timeout',
        isHtml: false,
      });
      const ok = slashProbe({ canonical: 'https://example.test/about' });
      await repo.addSlashProbes(id, [failed, ok]);
      expect((await repo.getById(id))?.slashProbes).toEqual([ok, failed]);
    });

    it('refuses slash probes for an unknown snapshot', async () => {
      const { repo } = await createRunning();
      await expect(repo.addSlashProbes('missing', [slashProbe()])).rejects.toThrow(
        SnapshotNotFound,
      );
    });

    it('lets check 1000 give the same occurrences from the snapshot read back', async () => {
      const { repo, id } = await createRunning();
      const about = page({ url: 'https://example.test/about', canonical: null });
      const probes = [slashProbe()];
      await repo.addPages(id, [about]);
      await repo.addSlashProbes(id, probes);
      const details = await repo.getById(id);
      if (!details) throw new Error('snapshot missing');

      const original = check1000.run({
        crawl: { ...crawlOf([about]), internalHost: 'example.test', slashProbes: probes },
      });
      const replayed = check1000.run({
        crawl: {
          ...crawlOf([...details.pages]),
          internalHost: 'example.test',
          slashProbes: details.slashProbes,
        },
      });
      expect(original).toHaveLength(1);
      expect(replayed).toEqual(original);
    });

    it('keeps a check result whose count is zero', async () => {
      const { repo, id } = await createRunning();
      const clean = checkResult({ count: 0, examined: 7, occurrences: [] });
      await repo.addCheckResults(id, [clean]);
      expect((await repo.getById(id))?.checkResults).toEqual([clean]);
    });

    it('finishes a snapshot with its crawled page count', async () => {
      const { repo, id } = await createRunning();
      await repo.finish(id, { finishedAt, pagesCrawled: 42 });
      expect((await repo.getById(id))?.snapshot).toMatchObject({
        status: 'finished',
        finishedAt,
        pagesCrawled: 42,
      });
    });

    it('refuses every write once finished', async () => {
      const { repo, id } = await createRunning();
      await repo.addPages(id, [page()]);
      await repo.finish(id, { finishedAt, pagesCrawled: 1 });

      await expect(repo.addPages(id, [page({ url: 'https://example.test/x' })])).rejects.toThrow(
        SnapshotImmutable,
      );
      await expect(repo.addLinks(id, [link])).rejects.toThrow(SnapshotImmutable);
      await expect(repo.addCheckResults(id, [checkResult()])).rejects.toThrow(SnapshotImmutable);
      await expect(repo.addSiteFiles(id, [])).rejects.toThrow(SnapshotImmutable);
      await expect(repo.addSlashProbes(id, [slashProbe()])).rejects.toThrow(SnapshotImmutable);
      await expect(
        repo.addHostProbe(id, {
          url: 'https://www.example.test/',
          status: 200,
          error: null,
          isHtml: true,
          canonical: null,
        }),
      ).rejects.toThrow(SnapshotImmutable);
      await expect(repo.finish(id, { finishedAt, pagesCrawled: 2 })).rejects.toThrow(
        SnapshotImmutable,
      );
      await expect(repo.fail(id, finishedAt)).rejects.toThrow(SnapshotImmutable);

      const details = await repo.getById(id);
      expect(details?.pages).toHaveLength(1);
      expect(details?.links).toHaveLength(0);
      expect(details?.checkResults).toHaveLength(0);
      expect(details?.snapshot.pagesCrawled).toBe(1);
    });

    it('marks a running snapshot as failed and then refuses writes', async () => {
      const { repo, id } = await createRunning();
      await repo.fail(id, finishedAt);
      const details = await repo.getById(id);
      expect(details?.snapshot).toMatchObject({ status: 'failed', finishedAt });
      await expect(repo.addPages(id, [page()])).rejects.toThrow(SnapshotImmutable);
    });

    it('does not expose any delete method', async () => {
      const { snapshots: repo } = await factory();
      const names = Object.getOwnPropertyNames(Object.getPrototypeOf(repo));
      expect(names.filter((name) => /delete|remove|drop/i.test(name))).toEqual([]);
    });
  });

  describe('SnapshotRepository launch counts', () => {
    const NOW = new Date('2026-03-10T12:00:00.000Z');
    const HOUR_MS = 60 * 60 * 1000;
    const DAY_MS = 24 * HOUR_MS;
    const since = new Date(NOW.getTime() - DAY_MS);

    const setup = async () => {
      const { snapshots, projects, users } = await factory();
      const project = await projects.findOrCreateByRootUrl({
        rootUrl: 'https://example.test/',
        ownerId: null,
        createdAt: startedAt,
      });
      const u = await users.create({
        email: 'u@example.fr',
        passwordHash: 'h',
        createdAt: startedAt,
      });
      const v = await users.create({
        email: 'v@example.fr',
        passwordHash: 'h',
        createdAt: startedAt,
      });
      const launch = (launchedBy: string | null, hoursAgo: number) =>
        snapshots.create({
          projectId: project.id,
          launchedBy,
          pagesLimit: 10,
          startedAt: new Date(NOW.getTime() - hoursAgo * HOUR_MS),
        });
      await launch(u.id, 1);
      await launch(u.id, 23);
      await launch(u.id, 25);
      await launch(v.id, 2);
      await launch(null, 3);
      return { snapshots, u: u.id, v: v.id };
    };

    it('lists, oldest first, only the launches of the given account in the last 24 hours', async () => {
      const { snapshots, u, v } = await setup();
      expect(await snapshots.listLaunchedAtBy(u, since)).toEqual([
        new Date(NOW.getTime() - 23 * HOUR_MS),
        new Date(NOW.getTime() - HOUR_MS),
      ]);
      expect(await snapshots.listLaunchedAtBy(v, since)).toEqual([
        new Date(NOW.getTime() - 2 * HOUR_MS),
      ]);
    });

    it('counts every API launch of the window, ignoring those without account', async () => {
      const { snapshots } = await setup();
      expect(await snapshots.countApiLaunchedSince(since)).toBe(3);
    });

    it('lists a failed launch too', async () => {
      const { snapshots, u } = await setup();
      const [latest] = await snapshots.listRunning();
      if (!latest) throw new Error('expected a running snapshot');
      await snapshots.fail(latest.id, NOW);
      expect(await snapshots.listLaunchedAtBy(u, since)).toHaveLength(2);
    });
  });

  describe('SnapshotRepository project history', () => {
    const at = (offsetMs: number): Date => new Date(startedAt.getTime() + offsetMs);

    const setup = async () => {
      const { snapshots, projects } = await factory();
      const project = await projects.findOrCreateByRootUrl({
        rootUrl: 'https://example.test/',
        ownerId: null,
        createdAt: startedAt,
      });
      const start = async (projectId: string, offsetMs: number) =>
        (
          await snapshots.create({
            launchedBy: null,
            projectId,
            pagesLimit: 10,
            startedAt: at(offsetMs),
          })
        ).id;
      return { snapshots, projects, project, start };
    };

    it('lists the snapshots of a project by descending start date, to the millisecond', async () => {
      const { snapshots, project, start } = await setup();
      const first = await start(project.id, 1);
      const third = await start(project.id, 3);
      const second = await start(project.id, 2);

      const listed = await snapshots.listByProject(project.id);

      expect(listed.map((snapshot) => snapshot.id)).toEqual([third, second, first]);
    });

    it('does not list the snapshots of another project', async () => {
      const { snapshots, projects, project, start } = await setup();
      const other = await projects.findOrCreateByRootUrl({
        rootUrl: 'https://other.test/',
        ownerId: null,
        createdAt: startedAt,
      });
      const mine = await start(project.id, 1);
      await start(other.id, 2);

      expect((await snapshots.listByProject(project.id)).map(({ id }) => id)).toEqual([mine]);
    });

    it('finds the latest finished snapshot started before the given date, ignoring failed and running ones', async () => {
      const { snapshots, project, start } = await setup();
      const s1 = await start(project.id, 1);
      await snapshots.finish(s1, { finishedAt: at(100), pagesCrawled: 1 });
      const s2 = await start(project.id, 2);
      await snapshots.fail(s2, at(100));
      await start(project.id, 3);
      await start(project.id, 4);

      const previous = await snapshots.findPreviousFinished(project.id, at(4));

      expect(previous?.id).toBe(s1);
    });

    it('prefers the most recent finished snapshot and excludes one starting at the same instant', async () => {
      const { snapshots, project, start } = await setup();
      const s1 = await start(project.id, 1);
      await snapshots.finish(s1, { finishedAt: at(100), pagesCrawled: 1 });
      const s2 = await start(project.id, 2);
      await snapshots.finish(s2, { finishedAt: at(100), pagesCrawled: 1 });

      expect((await snapshots.findPreviousFinished(project.id, at(3)))?.id).toBe(s2);
      expect((await snapshots.findPreviousFinished(project.id, at(2)))?.id).toBe(s1);
    });

    it('lists only the running snapshots, with their start date', async () => {
      const { snapshots, project, start } = await setup();
      const finished = await start(project.id, 1);
      await snapshots.finish(finished, { finishedAt: at(100), pagesCrawled: 1 });
      const running = await start(project.id, 2);

      const listed = await snapshots.listRunning();

      expect(listed.map(({ id, startedAt: began }) => ({ id, began }))).toEqual([
        { id: running, began: at(2) },
      ]);
    });

    it('lists the running snapshots of every project', async () => {
      const { snapshots, projects, project, start } = await setup();
      const other = await projects.findOrCreateByRootUrl({
        rootUrl: 'https://other.test/',
        ownerId: null,
        createdAt: startedAt,
      });
      const mine = await start(project.id, 1);
      const theirs = await start(other.id, 2);

      const ids = (await snapshots.listRunning()).map(({ id }) => id);

      expect([...ids].sort()).toEqual([mine, theirs].sort());
    });

    it('lists no running snapshot when none is running', async () => {
      const { snapshots } = await setup();
      expect(await snapshots.listRunning()).toEqual([]);
    });

    it('no longer lists a running snapshot once it has failed', async () => {
      const { snapshots, project, start } = await setup();
      const id = await start(project.id, 1);
      await snapshots.fail(id, at(100));

      expect(await snapshots.listRunning()).toEqual([]);
    });

    it('returns null when the project has no earlier finished snapshot', async () => {
      const { snapshots, project, start } = await setup();
      const only = await start(project.id, 1);
      expect(await snapshots.findPreviousFinished(project.id, at(1))).toBeNull();
      expect(only).toBeDefined();
    });
  });
  describe('AuditQueue contract', () => {
    const at = (seconds: number): Date => new Date(startedAt.getTime() + seconds * 1000);
    const admitAll = (): Promise<void> => Promise.resolve();

    const setup = async () => {
      const pair = await factory();
      const project = await pair.projects.findOrCreateByRootUrl({
        rootUrl: 'https://example.test/',
        ownerId: null,
        createdAt: startedAt,
      });
      const account = await pair.users.create({
        email: 'queue@example.test',
        passwordHash: 'h',
        createdAt: startedAt,
      });
      const enqueue = async (seconds: number, launchedBy: string | null = null): Promise<string> =>
        (
          await pair.snapshots.enqueue(
            { projectId: project.id, launchedBy, pagesLimit: 50, requestedAt: at(seconds) },
            admitAll,
          )
        ).id;
      return { queue: pair.snapshots, project, account, enqueue };
    };

    it('records a queued snapshot dated at the request, and journals an API launch', async () => {
      const { queue, account, enqueue } = await setup();

      const id = await enqueue(1, account.id);

      const details = await queue.getById(id);
      expect(details?.snapshot).toMatchObject({
        status: 'queued',
        startedAt: at(1),
        queuedAt: at(1),
        attempts: 0,
        pagesLimit: 50,
      });
      expect(await queue.listLaunchedAtBy(account.id, at(0))).toEqual([at(1)]);
    });

    it('does not journal a CLI launch', async () => {
      const { queue, enqueue } = await setup();
      await enqueue(1);
      expect(await queue.countApiLaunchedSince(at(0))).toBe(0);
    });

    it('writes nothing and propagates the error when the admission refuses', async () => {
      const { queue, project, account } = await setup();
      const refusal = new Error('refused');

      await expect(
        queue.enqueue(
          { projectId: project.id, launchedBy: account.id, pagesLimit: 50, requestedAt: at(1) },
          () => Promise.reject(refusal),
        ),
      ).rejects.toBe(refusal);

      expect(await queue.listByProject(project.id)).toEqual([]);
      expect(await queue.countApiLaunchedSince(at(0))).toBe(0);
    });

    it('lets the admission see the audits already queued', async () => {
      const { queue, project, account, enqueue } = await setup();
      await enqueue(1, account.id);
      let seen = -1;

      await queue.enqueue(
        { projectId: project.id, launchedBy: account.id, pagesLimit: 50, requestedAt: at(2) },
        async (view) => {
          seen = (await view.countActiveFor(account.id)) + 10 * (await view.countQueued());
        },
      );

      expect(seen).toBe(11);
    });

    it('claims the oldest queued audit, which runs at attempt 1, and ranks the others', async () => {
      const { queue, enqueue } = await setup();
      const first = await enqueue(1);
      const second = await enqueue(2);
      const third = await enqueue(3);

      const claimed = await queue.claimNext('worker-a', at(10));

      expect(claimed).toMatchObject({ id: first, status: 'running', attempts: 1, queuedAt: at(1) });
      expect(claimed?.heartbeatAt).toEqual(at(10));
      expect(await queue.queuePosition(second)).toBe(1);
      expect(await queue.queuePosition(third)).toBe(2);
      expect(await queue.queuePosition(first)).toBeNull();
    });

    it('claims nothing from an empty queue', async () => {
      const { queue } = await setup();
      expect(await queue.claimNext('worker-a', at(1))).toBeNull();
    });

    it('has no position for a finished or unknown snapshot', async () => {
      const { queue, enqueue } = await setup();
      const id = await enqueue(1);
      await queue.claimNext('worker-a', at(2));
      await queue.finishAttempt(id, 1, { finishedAt: at(3), pagesCrawled: 1 });

      expect(await queue.queuePosition(id)).toBeNull();
      expect(await queue.queuePosition('missing')).toBeNull();
    });

    it('counts the queued audits, and the queued or running ones of an account', async () => {
      const { queue, account, enqueue } = await setup();
      const finished = await enqueue(1, account.id);
      await queue.claimNext('worker-a', at(2));
      await queue.finishAttempt(finished, 1, { finishedAt: at(3), pagesCrawled: 1 });
      await enqueue(4, account.id);
      await queue.claimNext('worker-a', at(5));
      await enqueue(6, account.id);
      await enqueue(7);

      expect(await queue.countQueued()).toBe(2);
      expect(await queue.countActiveFor(account.id)).toBe(2);
    });
  });
};
