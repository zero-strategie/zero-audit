import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckResult } from '../../src/domain/check.js';
import { allChecks } from '../../src/domain/checks/index.js';
import { idleAuditDependencies } from '../support/audit-doubles.js';
import { idleAccountDependencies } from '../support/auth-doubles.js';
import { buildServer } from '../../src/http/server.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { expectNoCatalogueTitleCopied, makePage } from '../support/check-fixtures.js';

const minutes = (n: number): Date => new Date(Date.UTC(2026, 0, 1, 10, n));

const check15 = (urls: string[]): CheckResult => ({
  checkId: 15,
  severity: 'error',
  theme: 'on-page',
  count: urls.length,
  examined: 5,
  occurrences: urls.map((pageUrl) => ({ checkId: 15, pageUrl, info: {} })),
});

const pageUrls = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `https://e.com/p${String(i).padStart(2, '0')}`);

describe('read-only HTTP API: issues, pages, compare and checks', () => {
  let projects: InMemoryProjectRepository;
  let snapshots: InMemorySnapshotRepository;
  let app: FastifyInstance;

  const record = async (
    projectId: string,
    startMinute: number,
    results: CheckResult[],
    outcome: 'finished' | 'failed' = 'finished',
  ): Promise<string> => {
    const { id } = await snapshots.create({
      launchedBy: null,
      projectId,
      pagesLimit: 10,
      startedAt: minutes(startMinute),
    });
    await snapshots.addPages(id, [
      makePage('https://e.com/a', { status: 200, depth: 0, responseTimeMs: 50 }),
      makePage('https://e.com/b', { status: 404, depth: 1, responseTimeMs: 20 }),
    ]);
    await snapshots.addCheckResults(id, results);
    if (outcome === 'finished') {
      await snapshots.finish(id, { finishedAt: minutes(startMinute + 1), pagesCrawled: 2 });
    } else {
      await snapshots.fail(id, minutes(startMinute + 1));
    }
    return id;
  };

  const newProject = (rootUrl: string) =>
    projects.findOrCreateByRootUrl({ ownerId: null, rootUrl, createdAt: minutes(0) });

  const expectError = (
    response: { statusCode: number; json: () => unknown },
    status: number,
    code: string,
  ) => {
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({
      error: { code, message: expect.any(String) as string },
    });
  };

  beforeEach(() => {
    projects = new InMemoryProjectRepository();
    snapshots = new InMemorySnapshotRepository();
    app = buildServer({
      ...idleAccountDependencies(),
      projects,
      snapshots,
      health: snapshots,
      ...idleAuditDependencies(),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /checks', () => {
    it('lists the registry with French labels that are not catalogue titles', async () => {
      const response = await app.inject('/checks');

      expect(response.statusCode).toBe(200);
      const body =
        response.json<{ id: number; label: string; severity: string; theme: string }[]>();
      expect(body).toHaveLength(allChecks.length);
      expect(body[0]).toEqual({
        id: expect.any(Number) as number,
        label: expect.any(String) as string,
        severity: expect.any(String) as string,
        theme: expect.any(String) as string,
      });
      expectNoCatalogueTitleCopied(allChecks);
    });
  });

  describe('GET /snapshots/:id/issues', () => {
    it('lists every registry check, including those at 0, with their figures', async () => {
      const project = await newProject('https://e.com/');
      await record(project.id, 0, [check15(['https://e.com/a', 'https://e.com/b'])]);
      const id = await record(project.id, 10, [check15(['https://e.com/b', 'https://e.com/c'])]);

      const response = await app.inject(`/snapshots/${id}/issues`);

      expect(response.statusCode).toBe(200);
      const body = response.json<{ checkId: number }[]>();
      expect(body.map(({ checkId }) => checkId)).toEqual(
        allChecks.map(({ id: checkId }) => checkId).sort((a, b) => a - b),
      );
      expect(body.find(({ checkId }) => checkId === 15)).toEqual({
        checkId: 15,
        label: expect.any(String) as string,
        severity: 'error',
        theme: 'on-page',
        count: 2,
        examined: 5,
        delta: 0,
        newCount: 1,
        fixedCount: 1,
      });
      expect(body.find(({ checkId }) => checkId === 2)).toMatchObject({ count: 0, examined: 0 });
    });

    it('filters by severity and rejects an unknown severity with 400', async () => {
      const project = await newProject('https://e.com/');
      const id = await record(project.id, 0, []);

      const warnings = await app.inject(`/snapshots/${id}/issues?severity=warning`);
      const fatal = await app.inject(`/snapshots/${id}/issues?severity=fatal`);

      expect(
        new Set(warnings.json<{ severity: string }[]>().map(({ severity }) => severity)),
      ).toEqual(new Set(['warning']));
      expectError(fatal, 400, 'invalid_request');
    });

    it('answers 404 for an unknown snapshot', async () => {
      expectError(await app.inject('/snapshots/unknown/issues'), 404, 'not_found');
    });
  });

  describe('GET /snapshots/:id/issues/:checkId', () => {
    const recordTwentyFive = async (): Promise<string> => {
      const project = await newProject('https://e.com/');
      return record(project.id, 0, [check15(pageUrls(25))]);
    };

    it('returns the requested page of occurrences in a stable order', async () => {
      const id = await recordTwentyFive();

      const response = await app.inject(`/snapshots/${id}/issues/15?page=2&limit=10`);

      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: { pageUrl: string }[] }>();
      expect(body).toMatchObject({ total: 25, page: 2, limit: 10 });
      expect(body.items.map(({ pageUrl }) => pageUrl)).toEqual(pageUrls(25).slice(10, 20));
    });

    it('defaults to page 1 and limit 50', async () => {
      const id = await recordTwentyFive();

      const body = (await app.inject(`/snapshots/${id}/issues/15`)).json<object>();

      expect(body).toMatchObject({ total: 25, page: 1, limit: 50 });
    });

    it.each(['limit=201', 'limit=0', 'page=0', 'limit=abc'])(
      'rejects %s with 400',
      async (query) => {
        const id = await recordTwentyFive();

        expectError(
          await app.inject(`/snapshots/${id}/issues/15?${query}`),
          400,
          'invalid_request',
        );
      },
    );

    it('answers 404 for a check outside the registry and 200 for a known check at 0', async () => {
      const id = await recordTwentyFive();

      expectError(await app.inject(`/snapshots/${id}/issues/9999`), 404, 'not_found');
      const empty = await app.inject(`/snapshots/${id}/issues/2`);
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toMatchObject({ items: [], total: 0 });
    });

    it('answers 404 for an unknown snapshot', async () => {
      expectError(await app.inject('/snapshots/unknown/issues/15'), 404, 'not_found');
    });
  });

  describe('GET /snapshots/:id/pages', () => {
    it('sorts descending by status and exposes the page columns', async () => {
      const project = await newProject('https://e.com/');
      const id = await record(project.id, 0, [check15(['https://e.com/b'])]);

      const response = await app.inject(`/snapshots/${id}/pages?sort=-status`);

      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: { url: string }[] }>();
      expect(body).toMatchObject({ total: 2, page: 1, limit: 50 });
      expect(body.items).toEqual([
        {
          url: 'https://e.com/b',
          status: 404,
          depth: 1,
          group: 'broken',
          canonical: null,
          issues: 1,
          responseTimeMs: 20,
        },
        expect.objectContaining({ url: 'https://e.com/a', status: 200, group: 'healthy' }),
      ]);
    });

    it('rejects a sort outside the list with 400', async () => {
      const project = await newProject('https://e.com/');
      const id = await record(project.id, 0, []);

      expectError(await app.inject(`/snapshots/${id}/pages?sort=title`), 400, 'invalid_request');
    });

    it('answers 404 for an unknown snapshot', async () => {
      expectError(await app.inject('/snapshots/unknown/pages'), 404, 'not_found');
    });
  });

  describe('GET /compare', () => {
    it('compares two finished snapshots of the same project', async () => {
      const project = await newProject('https://e.com/');
      const a = await record(project.id, 0, [check15(['https://e.com/a', 'https://e.com/b'])]);
      const b = await record(project.id, 10, [check15(['https://e.com/b', 'https://e.com/c'])]);

      const response = await app.inject(`/compare?a=${a}&b=${b}`);

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        checks: { checkId: number }[];
        health: unknown;
        themes: unknown;
      }>();
      expect(body.checks.find(({ checkId }) => checkId === 15)).toEqual({
        checkId: 15,
        label: expect.any(String) as string,
        severity: 'error',
        theme: 'on-page',
        countA: 2,
        countB: 2,
        delta: 0,
        newCount: 1,
        fixedCount: 1,
        added: [{ pageUrl: 'https://e.com/c', info: {} }],
        removed: [{ pageUrl: 'https://e.com/a', info: {} }],
      });
      expect(body.health).toEqual({ score: expect.any(Number) as number, variation: 0 });
      expect(body.themes).toHaveProperty('on-page');
    });

    it('rejects snapshots of different projects, a non finished target and a missing b', async () => {
      const first = await newProject('https://e.com/');
      const second = await newProject('https://other.com/');
      const a = await record(first.id, 0, []);
      const other = await record(second.id, 5, []);
      const failed = await record(first.id, 10, [], 'failed');

      expectError(await app.inject(`/compare?a=${a}&b=${other}`), 400, 'invalid_request');
      expectError(await app.inject(`/compare?a=${a}&b=${failed}`), 400, 'invalid_request');
      expectError(await app.inject(`/compare?a=${a}`), 400, 'invalid_request');
    });

    it('answers 404 for an unknown snapshot', async () => {
      const project = await newProject('https://e.com/');
      const a = await record(project.id, 0, []);

      expectError(await app.inject(`/compare?a=${a}&b=unknown`), 404, 'not_found');
    });
  });
});
