import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckResult, Severity, Theme } from '../../src/domain/check.js';
import type { SiteFile } from '../../src/domain/crawl.js';
import { idleAuditDependencies } from '../support/audit-doubles.js';
import { idleAccountDependencies } from '../support/auth-doubles.js';
import { buildServer } from '../../src/http/server.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { makePage } from '../support/check-fixtures.js';

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const minutes = (n: number): Date => new Date(Date.UTC(2026, 0, 1, 10, n));

const result = (
  checkId: number,
  severity: Severity,
  theme: Theme,
  count: number,
  pageUrl = 'https://e.com/a',
): CheckResult => ({
  checkId,
  severity,
  theme,
  count,
  examined: 10,
  occurrences: Array.from({ length: count }, () => ({ checkId, pageUrl, info: {} })),
});

describe('read-only HTTP API', () => {
  let projects: InMemoryProjectRepository;
  let snapshots: InMemorySnapshotRepository;
  let app: FastifyInstance;

  const record = async (
    projectId: string,
    startMinute: number,
    results: CheckResult[],
    outcome: 'finished' | 'failed' = 'finished',
    siteFiles: SiteFile[] = [],
  ): Promise<string> => {
    const { id } = await snapshots.create({
      launchedBy: null,
      projectId,
      pagesLimit: 10,
      startedAt: minutes(startMinute),
    });
    await snapshots.addPages(id, [makePage('https://e.com/a'), makePage('https://e.com/b')]);
    await snapshots.addSiteFiles(id, siteFiles);
    await snapshots.addCheckResults(id, results);
    if (outcome === 'finished') {
      await snapshots.finish(id, { finishedAt: minutes(startMinute + 1), pagesCrawled: 2 });
    } else {
      await snapshots.fail(id, minutes(startMinute + 1));
    }
    return id;
  };

  const newProject = (rootUrl: string, createdAt = minutes(0)) =>
    projects.findOrCreateByRootUrl({ ownerId: null, rootUrl, createdAt });

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

  describe('GET /projects', () => {
    it('answers 200 with an empty list without any project', async () => {
      const response = await app.inject('/projects');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('lists every project with its latest finished snapshot', async () => {
      const first = await newProject('https://e.com/');
      await newProject('https://other.com/', minutes(5));
      const latest = await record(first.id, 10, [result(15, 'warning', 'on-page', 1)]);

      const response = await app.inject('/projects');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        {
          id: first.id,
          rootUrl: 'https://e.com/',
          createdAt: minutes(0).toISOString(),
          latestSnapshot: { id: latest, finishedAt: minutes(11).toISOString(), health: 90 },
          latestRun: { id: latest, status: 'finished', startedAt: minutes(10).toISOString() },
        },
        {
          id: expect.any(String) as string,
          rootUrl: 'https://other.com/',
          createdAt: minutes(5).toISOString(),
          latestSnapshot: null,
          latestRun: null,
        },
      ]);
    });

    it('gives a running snapshot as latest run of the project', async () => {
      const project = await newProject('https://e.com/');
      const { id } = await snapshots.create({
        launchedBy: null,
        projectId: project.id,
        pagesLimit: 10,
        startedAt: minutes(20),
      });

      const response = await app.inject('/projects');

      expect(response.json<{ latestRun: unknown }[]>()[0]?.latestRun).toEqual({
        id,
        status: 'running',
        startedAt: minutes(20).toISOString(),
      });
    });
  });

  describe('GET /projects/:id/snapshots', () => {
    it('lists the snapshots, most recent first, with status and health', async () => {
      const project = await newProject('https://e.com/');
      const first = await record(project.id, 0, [result(15, 'warning', 'on-page', 1)]);
      const second = await record(project.id, 10, [], 'failed');
      const third = await record(project.id, 20, [result(15, 'warning', 'on-page', 0)]);

      const response = await app.inject(`/projects/${project.id}/snapshots`);

      expect(response.statusCode).toBe(200);
      expect(
        response
          .json<{ id: string; status: string; health: number | null }[]>()
          .map(({ id, status, health }) => [id, status, health]),
      ).toEqual([
        [third, 'finished', 100],
        [second, 'failed', null],
        [first, 'finished', 90],
      ]);
    });

    it('answers 404 not_found for an unknown project', async () => {
      const response = await app.inject(`/projects/${UNKNOWN_UUID}/snapshots`);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: { code: 'not_found', message: expect.any(String) as string },
      });
    });

    it('answers 400 invalid_request when the id is not a UUID', async () => {
      const response = await app.inject('/projects/not-a-uuid/snapshots');

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: { code: 'invalid_request', message: expect.any(String) as string },
      });
    });
  });

  describe('GET /snapshots/:id', () => {
    const recordPair = async (): Promise<string> => {
      const project = await newProject('https://e.com/');
      await record(project.id, 0, [
        result(15, 'warning', 'on-page', 2),
        result(2, 'error', 'crawlability', 1),
      ]);
      return record(
        project.id,
        10,
        [
          result(15, 'warning', 'on-page', 1),
          result(2, 'error', 'crawlability', 1),
          result(213, 'notice', 'linking', 4),
          result(101, 'warning', 'on-page', 0),
        ],
        'finished',
        [{ kind: 'robots', url: 'https://e.com/robots.txt', status: 200, error: null }],
      );
    };

    it('contains the scores, variations, counters, groups, site files and top issues', async () => {
      const id = await recordPair();

      const response = await app.inject(`/snapshots/${id}`);

      expect(response.statusCode).toBe(200);
      const body = response.json<Record<string, unknown>>();
      expect(body).toMatchObject({
        snapshot: {
          id,
          rootUrl: 'https://e.com/',
          status: 'finished',
          startedAt: minutes(10).toISOString(),
          finishedAt: minutes(11).toISOString(),
          pagesCrawled: 2,
          pagesLimit: 10,
        },
        health: { score: 92, variation: 4 },
        counts: { errors: 1, warnings: 1, notices: 4 },
        pageGroups: {
          healthy: { count: 1, variation: 0 },
          'have-issues': { count: 1, variation: 0 },
        },
        siteFiles: [{ kind: 'robots', url: 'https://e.com/robots.txt', status: 200, error: null }],
      });
      expect(body['themes']).toMatchObject({
        'on-page': { score: 95, variation: 15 },
        https: { score: null, variation: null },
      });
      expect(body['topIssues']).toEqual([
        {
          checkId: 2,
          label: expect.any(String) as string,
          severity: 'error',
          theme: 'crawlability',
          count: 1,
          delta: 0,
        },
        {
          checkId: 15,
          label: expect.any(String) as string,
          severity: 'warning',
          theme: 'on-page',
          count: 1,
          delta: -1,
        },
        {
          checkId: 213,
          label: expect.any(String) as string,
          severity: 'notice',
          theme: 'linking',
          count: 4,
          delta: 4,
        },
      ]);
    });

    it('answers 404 not_found for an unknown snapshot', async () => {
      const response = await app.inject('/snapshots/unknown');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: { code: 'not_found', message: expect.any(String) as string },
      });
    });
  });

  describe('unsupported requests', () => {
    it('answers 404 in the error format for an unknown route', async () => {
      const response = await app.inject('/nothing-here');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: { code: 'not_found', message: expect.any(String) as string },
      });
    });

    it.each(['POST', 'PUT', 'DELETE'] as const)(
      'answers 404 to %s on an existing route',
      async (method) => {
        const response = await app.inject({ method, url: '/projects' });

        expect(response.statusCode).toBe(404);
        expect(response.json<{ error: { code: string } }>().error.code).toBe('not_found');
      },
    );

    it('sends no CORS header, even for a request with an Origin', async () => {
      const response = await app.inject({
        url: '/projects',
        headers: { origin: 'http://evil.test' },
      });

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
