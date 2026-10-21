import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuditAlreadyRunning, HostNotResolved } from '../../src/domain/errors.js';
import { HOUR_MS, idleAccountDependencies, NOW } from '../support/auth-doubles.js';
import { SESSION_TTL_MS } from '../../src/domain/session.js';
import { buildServer } from '../../src/http/server.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { FakeAuditRunner, FakeHostResolver } from '../support/audit-doubles.js';

const SITE = 'https://site.test/';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const ALICE_SESSION = 'session-alice';
const ADMIN_SESSION = 'session-admin';
const ADMIN_EMAIL = 'admin@exemple.test';

interface ApiError {
  error: { code: string; message: string };
}

describe('audit launch API', () => {
  let runner: FakeAuditRunner;
  let resolver: FakeHostResolver;
  let app: FastifyInstance;
  let projects: InMemoryProjectRepository;
  let snapshots: InMemorySnapshotRepository;
  let account: ReturnType<typeof idleAccountDependencies>;
  let alice: { id: string };

  const openSession = async (email: string, id: string): Promise<{ id: string }> => {
    const user = await account.users.create({ email, passwordHash: 'h', createdAt: NOW });
    await account.users.markVerified(user.id, NOW);
    await account.sessions.create({
      id,
      userId: user.id,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + SESSION_TTL_MS),
    });
    return user;
  };

  const serverWith = (allowPrivateTargets: boolean, launchesPerDay = 30): FastifyInstance => {
    projects = new InMemoryProjectRepository();
    snapshots = new InMemorySnapshotRepository();
    runner = new FakeAuditRunner({ snapshots, now: () => account.clock.now() });
    return buildServer({
      ...account,
      adminEmails: [ADMIN_EMAIL],
      projects,
      snapshots,
      health: snapshots,
      auditRunner: runner,
      hostResolver: resolver,
      allowPrivateTargets,
      launchesPerDay,
    });
  };

  const post = (payload: object, session: string | null = ALICE_SESSION) =>
    app.inject({
      method: 'POST',
      url: '/audits',
      payload,
      headers: session === null ? {} : { 'x-session-id': session },
    });

  beforeEach(async () => {
    account = idleAccountDependencies();
    resolver = new FakeHostResolver();
    app = serverWith(false);
    alice = await openSession('alice@exemple.test', ALICE_SESSION);
    await openSession(ADMIN_EMAIL, ADMIN_SESSION);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /audits', () => {
    it('answers 202 with the snapshot and project ids', async () => {
      const response = await post({ url: SITE, limit: 100 });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ snapshotId: 'snap-1', projectId: 'proj-1' });
      expect(runner.requests).toEqual([
        { rootUrl: SITE, limit: 100, ownerId: alice.id, launchedBy: alice.id },
      ]);
    });

    it.each([
      ['no session', null],
      ['an unknown session', 'session-unknown'],
    ])('answers 401 and starts nothing with %s', async (_label, session) => {
      const response = await post({ url: SITE }, session);

      expect(response.statusCode).toBe(401);
      expect(response.json<ApiError>().error.code).toBe('unauthenticated');
      expect(runner.requests).toEqual([]);
      expect(await snapshots.countApiLaunchedSince(new Date(0))).toBe(0);
    });

    it('answers 401 for an expired session', async () => {
      account.clock.advance(SESSION_TTL_MS + 1);

      const response = await post({ url: SITE });

      expect(response.statusCode).toBe(401);
      expect(runner.requests).toEqual([]);
    });

    it('uses a limit of 100 when none is given', async () => {
      await post({ url: SITE });

      expect(runner.requests).toEqual([
        { rootUrl: SITE, limit: 100, ownerId: alice.id, launchedBy: alice.id },
      ]);
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

  describe('POST /audits quotas', () => {
    const me = (session: string) =>
      app.inject({ method: 'GET', url: '/auth/me', headers: { 'x-session-id': session } });
    const launchOnce = async (session = ALICE_SESSION) => {
      const response = await post({ url: SITE, limit: 50 }, session);
      expect(response.statusCode).toBe(202);
      account.clock.advance(HOUR_MS);
    };

    it('refuses 250 pages to a free account and accepts 100', async () => {
      const refused = await post({ url: SITE, limit: 250 });

      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual({
        error: { code: 'quota_exceeded', message: 'Votre compte permet 100 pages par audit' },
      });
      expect(runner.requests).toEqual([]);
      expect((await post({ url: SITE, limit: 100 })).statusCode).toBe(202);
    });

    it('refuses the fourth audit in 24 hours, a failed one included, then accepts it a day after the oldest', async () => {
      await launchOnce();
      await launchOnce();
      await launchOnce();
      const [latest] = await snapshots.listRunning();
      if (!latest) throw new Error('expected a running snapshot');
      await snapshots.fail(latest.id, new Date(account.clock.now()));

      const refused = await post({ url: SITE });

      expect(refused.statusCode).toBe(429);
      expect(refused.json<ApiError>().error.code).toBe('quota_exceeded');
      const nextAt = new Date(NOW.getTime() + 24 * HOUR_MS).toISOString();
      expect(refused.json<ApiError>().error.message).toContain(nextAt);
      expect((await me(ALICE_SESSION)).json()).toMatchObject({
        auditsRemaining: 0,
        nextAuditAt: nextAt,
      });

      account.clock.advance(21 * HOUR_MS + 1);
      expect((await post({ url: SITE })).statusCode).toBe(202);
    });

    it('counts neither an anti-SSRF refusal nor a conflict with a running audit', async () => {
      resolver.outcome = ['10.0.0.1'];
      expect((await post({ url: SITE })).statusCode).toBe(400);
      resolver.outcome = ['93.184.216.34'];
      runner.startOutcome = new AuditAlreadyRunning(NOW);
      expect((await post({ url: SITE })).statusCode).toBe(409);

      expect((await me(ALICE_SESSION)).json()).toMatchObject({ auditsRemaining: 3 });
    });

    it('lets an administrator launch 500 pages and more than 3 audits a day', async () => {
      expect((await post({ url: SITE, limit: 500 }, ADMIN_SESSION)).statusCode).toBe(202);
      await launchOnce(ADMIN_SESSION);
      await launchOnce(ADMIN_SESSION);
      await launchOnce(ADMIN_SESSION);

      expect((await post({ url: SITE }, ADMIN_SESSION)).statusCode).toBe(202);
    });

    it('stops everybody at the daily ceiling of the API, with a message of its own, and ignores the CLI', async () => {
      await app.close();
      app = serverWith(false, 3);
      await snapshots.create({
        projectId: 'proj-cli',
        launchedBy: null,
        pagesLimit: 10,
        startedAt: new Date(account.clock.now()),
      });
      await launchOnce(ADMIN_SESSION);
      await launchOnce(ADMIN_SESSION);
      await launchOnce(ALICE_SESSION);

      const free = await post({ url: SITE });
      const admin = await post({ url: SITE }, ADMIN_SESSION);

      for (const response of [free, admin]) {
        expect(response.statusCode).toBe(429);
        expect(response.json<ApiError>().error.code).toBe('quota_exceeded');
        expect(response.json<ApiError>().error.message).toContain('limite quotidienne');
      }
    });

    it('reports the quota of the account on GET /auth/me', async () => {
      await launchOnce();

      expect((await me(ALICE_SESSION)).json()).toEqual({
        email: 'alice@exemple.test',
        isAdmin: false,
        pagesLimitMax: 100,
        auditsRemaining: 2,
        nextAuditAt: null,
      });
      expect((await me(ADMIN_SESSION)).json()).toEqual({
        email: ADMIN_EMAIL,
        isAdmin: true,
        pagesLimitMax: 500,
        auditsRemaining: null,
        nextAuditAt: null,
      });
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

      const project = await projects.findOrCreateByRootUrl({
        rootUrl: SITE,
        ownerId: null,
        createdAt: new Date('2026-01-01T09:00:00.000Z'),
      });
      const { id } = await snapshots.create({
        launchedBy: null,
        projectId: project.id,
        pagesLimit: 100,
        startedAt: new Date('2026-01-01T10:00:00.000Z'),
      });

      const response = await app.inject(`/snapshots/${id}/progress`);

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
