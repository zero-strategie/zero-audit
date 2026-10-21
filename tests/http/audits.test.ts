import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuditAlreadyRunning, HostNotResolved } from '../../src/domain/errors.js';
import { buildServer } from '../../src/http/server.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { FakeAuditRunner, FakeHostResolver } from '../support/audit-doubles.js';

const SITE = 'https://site.test/';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

interface ApiError {
  error: { code: string; message: string };
}

describe('audit launch API', () => {
  let runner: FakeAuditRunner;
  let resolver: FakeHostResolver;
  let app: FastifyInstance;

  const serverWith = (allowPrivateTargets: boolean): FastifyInstance => {
    const snapshots = new InMemorySnapshotRepository();
    return buildServer({
      projects: new InMemoryProjectRepository(),
      snapshots,
      health: snapshots,
      auditRunner: runner,
      hostResolver: resolver,
      allowPrivateTargets,
    });
  };

  const post = (payload: object) => app.inject({ method: 'POST', url: '/audits', payload });

  beforeEach(() => {
    runner = new FakeAuditRunner();
    resolver = new FakeHostResolver();
    app = serverWith(false);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /audits', () => {
    it('answers 202 with the snapshot and project ids', async () => {
      const response = await post({ url: SITE, limit: 100 });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ snapshotId: 'snap-1', projectId: 'proj-1' });
      expect(runner.requests).toEqual([{ rootUrl: SITE, limit: 100 }]);
    });

    it('uses a limit of 100 when none is given', async () => {
      await post({ url: SITE });

      expect(runner.requests).toEqual([{ rootUrl: SITE, limit: 100 }]);
    });

    it.each([75, 0, 1000])('answers 400 invalid_request for the limit %s', async (limit) => {
      const response = await post({ url: SITE, limit });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiError>().error.code).toBe('invalid_request');
      expect(runner.requests).toEqual([]);
    });

    it.each([
      { url: 'zero-strategie.dev' },
      { url: 'ftp://site.test' },
      { url: 'https://' },
      { url: 'http://:80/' },
      {},
    ])('answers 400 invalid_request for the body %j and starts nothing', async (body) => {
      const response = await post(body);

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiError>().error.code).toBe('invalid_request');
      expect(response.json<ApiError>().error.message).not.toBe('');
      expect(response.json<ApiError>().error.message).not.toContain('body/');
      expect(runner.requests).toEqual([]);
    });

    it('refuses a host with one internal address among its resolved ones', async () => {
      resolver.outcome = ['93.184.216.34', '10.0.0.1'];

      const response = await post({ url: SITE });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiError>().error.code).toBe('invalid_request');
      expect(response.json<ApiError>().error.message).toContain('interne');
      expect(runner.requests).toEqual([]);
    });

    it.each(['http://127.0.0.1/', 'http://[::1]/'])(
      'refuses the literal address %s',
      async (url) => {
        const response = await post({ url });

        expect(response.statusCode).toBe(400);
        expect(response.json<ApiError>().error.message).toContain('interne');
      },
    );

    it('answers 400 when the domain name does not resolve', async () => {
      resolver.outcome = new HostNotResolved('site.test');

      const response = await post({ url: SITE });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'invalid_request',
          message: 'Site introuvable : le nom de domaine ne résout pas',
        },
      });
    });

    it('accepts a local target once private targets are allowed', async () => {
      await app.close();
      app = serverWith(true);

      const response = await post({ url: 'http://127.0.0.1:8080/' });

      expect(response.statusCode).toBe(202);
    });

    it('answers 409 conflict with the start date of the blocking audit', async () => {
      runner.startOutcome = new AuditAlreadyRunning(new Date('2026-01-01T10:00:00.000Z'));

      const response = await post({ url: SITE });

      expect(response.statusCode).toBe(409);
      expect(response.json<ApiError>().error.code).toBe('conflict');
      expect(response.json<ApiError>().error.message).toContain('2026-01-01T10:00:00.000Z');
      expect(response.json<ApiError>().error.message).toContain(
        'Un audit est déjà en cours depuis',
      );
    });

    it.each(['PUT', 'DELETE', 'GET'] as const)('answers 404 for %s /audits', async (method) => {
      const response = await app.inject({ method, url: '/audits' });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /snapshots/:id/progress', () => {
    it('answers the progress of a running audit', async () => {
      runner.progressOutcome = {
        status: 'running',
        pagesCrawled: 12,
        pagesLimit: 100,
        startedAt: new Date('2026-01-01T10:00:00.000Z'),
        rootUrl: SITE,
      };

      const response = await app.inject(`/snapshots/${UNKNOWN_UUID}/progress`);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'running',
        pagesCrawled: 12,
        pagesLimit: 100,
        startedAt: '2026-01-01T10:00:00.000Z',
        rootUrl: SITE,
      });
    });

    it('answers 404 for an unknown snapshot', async () => {
      const response = await app.inject(`/snapshots/${UNKNOWN_UUID}/progress`);

      expect(response.statusCode).toBe(404);
      expect(response.json<ApiError>().error.code).toBe('not_found');
    });
  });
});
