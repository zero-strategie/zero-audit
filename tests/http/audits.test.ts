import { formatParisDateTime } from '../../src/http/format-date.js';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HostNotResolved } from '../../src/domain/errors.js';
import { HOUR_MS, idleAccountDependencies, NOW } from '../support/auth-doubles.js';
import { SESSION_TTL_MS } from '../../src/domain/session.js';
import { buildServer } from '../../src/http/server.js';
import { InMemoryAccountEraser } from '../../src/infrastructure/in-memory-account-eraser.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { FakeHostResolver } from '../support/audit-doubles.js';

const SITE = 'https://site.test/';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const ALICE_SESSION = 'session-alice';
const ADMIN_SESSION = 'session-admin';
const ADMIN_EMAIL = 'admin@exemple.test';

interface ApiError {
  error: { code: string; message: string };
}

describe('audit launch API', () => {
  let resolver: FakeHostResolver;
  let app: FastifyInstance;
  let projects: InMemoryProjectRepository;
  let snapshots: InMemorySnapshotRepository;
  let account: ReturnType<typeof idleAccountDependencies>;
  let alice: { id: string };

  const openSession = async (email: string, id: string): Promise<{ id: string }> => {
    const user = await account.users.create({
      email,
      passwordHash: 'hashed:secret password',
      createdAt: NOW,
    });
    await account.users.markVerified(user.id, NOW);
    await account.sessions.create({
      id,
      userId: user.id,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + SESSION_TTL_MS),
    });
    return user;
  };

  const serverWith = (
    allowPrivateTargets: boolean,
    launchesPerDay = 30,
    queueMax = 20,
  ): FastifyInstance => {
    projects = new InMemoryProjectRepository();
    snapshots = new InMemorySnapshotRepository(account.users);
    return buildServer({
      ...account,
      eraser: new InMemoryAccountEraser({ ...account, projects, snapshots }),
      adminEmails: [ADMIN_EMAIL],
      projects,
      snapshots,
      health: snapshots,
      queue: snapshots,
      hostResolver: resolver,
      allowPrivateTargets,
      launchesPerDay,
      queueMax,
    });
  };

  const post = (payload: object, session: string | null = ALICE_SESSION) =>
    app.inject({
      method: 'POST',
      url: '/audits',
      payload,
      headers: session === null ? {} : { 'x-session-id': session },
    });

  const expectNothingQueued = async () => {
    expect(await snapshots.countQueued()).toBe(0);
    expect(await snapshots.countApiLaunchedSince(new Date(0))).toBe(0);
  };

  /** What a worker does: takes the next audit and ends it, so the account may launch again. */
  const finishNextAudit = async () => {
    const claimed = await snapshots.claimNext('worker', new Date(account.clock.now()));
    if (!claimed) throw new Error('expected a queued audit');
    await snapshots.finishAttempt(claimed.id, claimed.attempts, {
      finishedAt: new Date(account.clock.now()),
      pagesCrawled: 1,
    });
  };

  let arrivals = 0;
  const enqueueFor = (launchedBy: string | null, { running = false } = {}) => {
    arrivals += 1;
    return snapshots
      .enqueue(
        {
          projectId: 'p',
          launchedBy,
          pagesLimit: 10,
          requestedAt: new Date(NOW.getTime() - 1e6 + arrivals),
        },
        () => Promise.resolve(),
      )
      .then(async (snapshot) => {
        if (running) await snapshots.claimNext('other-worker', NOW);
        return snapshot;
      });
  };

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
      const { snapshotId, projectId } = response.json<{ snapshotId: string; projectId: string }>();
      expect((await snapshots.getById(snapshotId))?.snapshot).toMatchObject({
        status: 'queued',
        pagesLimit: 100,
        projectId,
      });
      expect(await projects.getById(projectId)).toMatchObject({ rootUrl: SITE, ownerId: alice.id });
      expect(await snapshots.listLaunchedAtBy(alice.id, new Date(0))).toHaveLength(1);
    });

    it.each([
      ['no session', null],
      ['an unknown session', 'session-unknown'],
    ])('answers 401 and starts nothing with %s', async (_label, session) => {
      const response = await post({ url: SITE }, session);

      expect(response.statusCode).toBe(401);
      expect(response.json<ApiError>().error.code).toBe('unauthenticated');
      await expectNothingQueued();
      expect(await snapshots.countApiLaunchedSince(new Date(0))).toBe(0);
    });

    it('answers 401 for an expired session', async () => {
      account.clock.advance(SESSION_TTL_MS + 1);

      const response = await post({ url: SITE });

      expect(response.statusCode).toBe(401);
      await expectNothingQueued();
    });

    it('uses a limit of 100 when none is given', async () => {
      const { snapshotId } = (await post({ url: SITE })).json<{ snapshotId: string }>();

      expect((await snapshots.getById(snapshotId))?.snapshot.pagesLimit).toBe(100);
    });

    it.each([75, 0, 1000])('answers 400 invalid_request for the limit %s', async (limit) => {
      const response = await post({ url: SITE, limit });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiError>().error.code).toBe('invalid_request');
      await expectNothingQueued();
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
      await expectNothingQueued();
    });

    it('refuses a host with one internal address among its resolved ones', async () => {
      resolver.outcome = ['93.184.216.34', '10.0.0.1'];

      const response = await post({ url: SITE });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiError>().error.code).toBe('invalid_request');
      expect(response.json<ApiError>().error.message).toContain('interne');
      await expectNothingQueued();
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

    it.each([
      ['a free account', ALICE_SESSION],
      ['an administrator', ADMIN_SESSION],
    ])('answers 409 conflict to %s who already has an audit queued', async (_label, session) => {
      expect((await post({ url: SITE }, session)).statusCode).toBe(202);

      const response = await post({ url: SITE }, session);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: { code: 'conflict', message: 'Vous avez déjà un audit en cours ou en file' },
      });
      expect(await snapshots.countQueued()).toBe(1);
    });

    it('creates no project when the launch is refused with 409', async () => {
      expect((await post({ url: SITE })).statusCode).toBe(202);
      const before = await projects.list(alice.id);

      const response = await post({ url: 'https://other-site.test/' });

      expect(response.statusCode).toBe(409);
      expect(await projects.list(alice.id)).toEqual(before);
    });

    it('creates no project when the launch is refused with 429 because the queue is full', async () => {
      for (let index = 0; index < 20; index += 1) await enqueueFor(`other-${String(index)}`);
      const before = await projects.list(alice.id);

      const response = await post({ url: 'https://other-site.test/' });

      expect(response.statusCode).toBe(429);
      expect(await projects.list(alice.id)).toEqual(before);
    });

    it('answers 409 to an account whose audit is running', async () => {
      await enqueueFor(alice.id, { running: true });

      expect((await post({ url: SITE })).statusCode).toBe(409);
    });

    it('answers 429 quota_exceeded without Retry-After when 20 audits are queued', async () => {
      for (let index = 0; index < 20; index += 1) await enqueueFor(`other-${String(index)}`);

      const response = await post({ url: SITE });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toEqual({
        error: { code: 'quota_exceeded', message: "La file d'attente est pleine" },
      });
      expect(response.headers['retry-after']).toBeUndefined();
      expect(await snapshots.countQueued()).toBe(20);
    });

    it('answers 202 with 19 audits queued and one running: only the queued ones count', async () => {
      await enqueueFor('runner', { running: true });
      for (let index = 0; index < 19; index += 1) await enqueueFor(`other-${String(index)}`);

      expect((await post({ url: SITE })).statusCode).toBe(202);
    });

    it('reads the queue ceiling from the dependencies', async () => {
      await app.close();
      app = serverWith(false, 30, 1);
      await enqueueFor('other');

      expect((await post({ url: SITE })).statusCode).toBe(429);
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
      await finishNextAudit();
      account.clock.advance(HOUR_MS);
    };

    it('refuses 250 pages to a free account and accepts 100', async () => {
      const refused = await post({ url: SITE, limit: 250 });

      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual({
        error: { code: 'quota_exceeded', message: 'Votre compte permet 100 pages par audit' },
      });
      await expectNothingQueued();
      expect((await post({ url: SITE, limit: 100 })).statusCode).toBe(202);
    });

    it('refuses the fourth audit in 24 hours, a failed one included, then accepts it a day after the oldest', async () => {
      await launchOnce();
      await launchOnce();
      expect((await post({ url: SITE, limit: 50 })).statusCode).toBe(202);
      const claimed = await snapshots.claimNext('worker', new Date(account.clock.now()));
      if (!claimed) throw new Error('expected a queued audit');
      await snapshots.failAttempt(claimed.id, claimed.attempts, new Date(account.clock.now()));
      account.clock.advance(HOUR_MS);

      const refused = await post({ url: SITE });

      expect(refused.statusCode).toBe(429);
      expect(refused.json<ApiError>().error.code).toBe('quota_exceeded');
      const nextAt = new Date(NOW.getTime() + 24 * HOUR_MS).toISOString();
      expect(refused.json<ApiError>().error.message).toContain(
        `possible le ${formatParisDateTime(new Date(nextAt))}`,
      );
      expect(refused.json<ApiError>().error.message).not.toContain(nextAt);
      expect((await me(ALICE_SESSION)).json()).toMatchObject({
        auditsRemaining: 0,
        nextAuditAt: nextAt,
      });

      account.clock.advance(21 * HOUR_MS + 1);
      expect((await post({ url: SITE })).statusCode).toBe(202);
    });

    it('keeps refusing the fourth audit after the account was deleted and registered again', async () => {
      await launchOnce();
      await launchOnce();
      await launchOnce();
      const deletion = await app.inject({
        method: 'DELETE',
        url: '/auth/me',
        payload: { password: 'secret password' },
        headers: { 'x-session-id': ALICE_SESSION },
      });
      expect(deletion.statusCode).toBe(204);
      const again = await account.users.create({
        email: 'alice@exemple.test',
        passwordHash: 'h',
        createdAt: new Date(account.clock.now()),
      });
      await account.users.markVerified(again.id, new Date(account.clock.now()));
      await account.sessions.create({
        id: 'session-again',
        userId: again.id,
        createdAt: new Date(account.clock.now()),
        expiresAt: new Date(account.clock.now() + SESSION_TTL_MS),
      });

      const refused = await post({ url: SITE }, 'session-again');

      expect(refused.statusCode).toBe(429);
      expect(refused.json<ApiError>().error.code).toBe('quota_exceeded');
    });

    it('counts neither an anti-SSRF refusal nor a conflict with an audit already queued', async () => {
      resolver.outcome = ['10.0.0.1'];
      expect((await post({ url: SITE })).statusCode).toBe(400);
      resolver.outcome = ['93.184.216.34'];
      expect((await post({ url: SITE })).statusCode).toBe(202);
      expect((await post({ url: SITE })).statusCode).toBe(409);

      expect((await me(ALICE_SESSION)).json()).toMatchObject({ auditsRemaining: 2 });
    });

    it('lets an administrator launch 500 pages and more than 3 audits a day', async () => {
      expect((await post({ url: SITE, limit: 500 }, ADMIN_SESSION)).statusCode).toBe(202);
      await finishNextAudit();
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
    const progressOf = (id: string, session: string | null = ALICE_SESSION) =>
      app.inject({
        url: `/snapshots/${id}/progress`,
        headers: session === null ? {} : { 'x-session-id': session },
      });
    const project = () =>
      projects.findOrCreateByRootUrl({ rootUrl: SITE, ownerId: alice.id, createdAt: NOW });

    it('reports the position of the third queued audit, read from storage', async () => {
      await enqueueFor('other-1');
      await enqueueFor('other-2');
      const { projectId, snapshotId } = (await post({ url: SITE, limit: 50 })).json<{
        projectId: string;
        snapshotId: string;
      }>();
      expect(projectId).not.toBe('');

      const response = await progressOf(snapshotId);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'queued',
        pagesCrawled: 0,
        pagesLimit: 50,
        startedAt: new Date(account.clock.now()).toISOString(),
        rootUrl: SITE,
        queuePosition: 3,
        attempts: 0,
      });
    });

    it('reports a running audit with its heartbeat pages and no position', async () => {
      const { snapshotId } = (await post({ url: SITE })).json<{ snapshotId: string }>();
      const claimed = await snapshots.claimNext('worker', new Date(account.clock.now()));
      await snapshots.heartbeat(snapshotId, claimed?.attempts ?? 0, 12, NOW);

      expect((await progressOf(snapshotId)).json()).toMatchObject({
        status: 'running',
        pagesCrawled: 12,
        queuePosition: null,
        attempts: 1,
      });
    });

    it('refuses the audit of another account like a missing one', async () => {
      const { id } = await snapshots.create({
        launchedBy: null,
        projectId: (await project()).id,
        pagesLimit: 100,
        startedAt: NOW,
      });

      const response = await progressOf(id, ADMIN_SESSION);

      expect(response.statusCode).toBe(404);
      expect(response.json<ApiError>().error.code).toBe('not_found');
      expect((await progressOf(id, null)).statusCode).toBe(404);
    });

    it('answers 404 for an unknown snapshot', async () => {
      const response = await app.inject(`/snapshots/${UNKNOWN_UUID}/progress`);

      expect(response.statusCode).toBe(404);
      expect(response.json<ApiError>().error.code).toBe('not_found');
    });
  });

  describe('routes of projects and snapshots with a queued audit', () => {
    it('validates their schema with the status queued', async () => {
      const { snapshotId, projectId } = (await post({ url: SITE })).json<{
        snapshotId: string;
        projectId: string;
      }>();
      const headers = { 'x-session-id': ALICE_SESSION };

      const list = await app.inject({ url: '/projects', headers });
      const history = await app.inject({ url: `/projects/${projectId}/snapshots`, headers });
      const report = await app.inject({ url: `/snapshots/${snapshotId}`, headers });

      expect(list.statusCode).toBe(200);
      expect(JSON.stringify(list.json())).toContain('"queued"');
      expect(history.statusCode).toBe(200);
      expect(JSON.stringify(history.json())).toContain('"queued"');
      expect(report.statusCode).toBe(200);
    });
  });
});
