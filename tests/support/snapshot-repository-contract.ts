import { describe, expect, it } from 'vitest';
import type { SnapshotRepository } from '../../src/application/ports/snapshot-repository.js';
import type { CheckResult } from '../../src/domain/check.js';
import type { Link, Page } from '../../src/domain/crawl.js';
import { SnapshotImmutable } from '../../src/domain/errors.js';

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
  h1: ['Home'],
  wordCount: 250,
  contentHash: 'abc123',
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
  theme: 'content',
  count: 1,
  examined: 5,
  occurrences: [{ checkId: 3, pageUrl: 'https://example.test/', info: { length: 12 } }],
  ...overrides,
});

export const describeSnapshotRepositoryContract = (
  factory: () => Promise<SnapshotRepository> | SnapshotRepository,
): void => {
  describe('SnapshotRepository contract', () => {
    const createRunning = async (): Promise<{ repo: SnapshotRepository; id: string }> => {
      const repo = await factory();
      const snapshot = await repo.create({ pagesLimit: 100, startedAt });
      return { repo, id: snapshot.id };
    };

    it('creates a running snapshot with its limit', async () => {
      const { repo, id } = await createRunning();
      const details = await repo.getById(id);
      expect(details?.snapshot).toMatchObject({
        id,
        status: 'running',
        startedAt,
        finishedAt: null,
        pagesLimit: 100,
      });
    });

    it('returns null for an unknown id', async () => {
      const repo = await factory();
      expect(await repo.getById('missing')).toBeNull();
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
      const repo = await factory();
      const names = Object.getOwnPropertyNames(Object.getPrototypeOf(repo));
      expect(names.filter((name) => /delete|remove|drop/i.test(name))).toEqual([]);
    });
  });
};
