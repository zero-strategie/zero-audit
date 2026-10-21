import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuditWorker } from '../../src/cli/audit-factory.js';
import { SESSION_TTL_MS } from '../../src/domain/session.js';
import { buildAuthKit, idleAccountDependencies, NOW } from '../support/auth-doubles.js';
import { buildServer } from '../../src/http/server.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { FakeHostResolver } from '../support/audit-doubles.js';
import { migrate } from '../../src/infrastructure/postgres/migrate.js';
import { PostgresSnapshotRepository } from '../../src/infrastructure/postgres/postgres-snapshot-repository.js';
import {
  createTestDatabase,
  TEST_DATABASE_URL,
  type TestDatabase,
} from '../support/postgres-test-database.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';

const WORKER_POLL_TIMEOUT_MS = 8000;

interface Launched {
  snapshotId: string;
  projectId: string;
}

describe('audit launched through the API against a local fixture site', () => {
  let fixtures: FixtureServer | null = null;

  afterEach(async () => {
    await fixtures?.close();
  });

  it('answers 202, then a worker crawls the queued audit until it is finished', async () => {
    fixtures = await startFixtureServer({
      '/': { status: 200, headers: { 'content-type': 'text/html' }, body: '<html></html>' },
    });
    const projects = new InMemoryProjectRepository();
    const snapshots = new InMemorySnapshotRepository();
    const worker = createAuditWorker({
      storage: { projects, snapshots, queue: snapshots },
      logger: { info: () => undefined, error: () => undefined },
      allowPrivateTargets: true,
      delayMs: 0,
    });
    const stopWorker = new AbortController();
    const running = worker.run(stopWorker.signal);
    const account = idleAccountDependencies();
    const user = await account.users.create({
      email: 'alice@exemple.test',
      passwordHash: 'h',
      createdAt: NOW,
    });
    await account.sessions.create({
      id: 'session-alice',
      userId: user.id,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + SESSION_TTL_MS),
    });
    const app = buildServer({
      ...account,
      projects,
      snapshots,
      health: snapshots,
      queue: snapshots,
      hostResolver: new FakeHostResolver(),
      allowPrivateTargets: true,
      launchesPerDay: 30,
      queueMax: 20,
    });

    try {
      const launched = await app.inject({
        method: 'POST',
        url: '/audits',
        payload: { url: `${fixtures.baseUrl}/`, limit: 50 },
        headers: { 'x-session-id': 'session-alice' },
      });

      expect(launched.statusCode).toBe(202);
      const { snapshotId, projectId } = launched.json<Launched>();
      expect((await projects.getById(projectId))?.ownerId).toBe(user.id);
      expect(await snapshots.listLaunchedAtBy(user.id, new Date(0))).toHaveLength(1);
      await vi.waitFor(
        async () => {
          const progress = await app.inject({
            url: `/snapshots/${snapshotId}/progress`,
            headers: { 'x-session-id': 'session-alice' },
          });
          expect(progress.json()).toMatchObject({ status: 'finished', pagesCrawled: 1 });
          // The worker polls an empty queue every 2 seconds.
        },
        { timeout: WORKER_POLL_TIMEOUT_MS },
      );
    } finally {
      stopWorker.abort();
      await running;
      await app.close();
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)('simultaneous launches on Postgres', () => {
  let database: TestDatabase | undefined;

  afterEach(async () => {
    await database?.dispose();
  });

  it('lets one of two simultaneous launches of the same account through and refuses the other', async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    await migrate(database.pool);
    const repository = new PostgresSnapshotRepository(database.pool);
    const kit = buildAuthKit();
    const user = await repository.users.create({
      email: 'alice@exemple.test',
      passwordHash: 'h',
      createdAt: NOW,
    });
    await repository.users.markVerified(user.id, NOW);
    await repository.sessions.create({
      id: 'session-alice',
      userId: user.id,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + SESSION_TTL_MS),
    });
    const app = buildServer({
      ...kit,
      users: repository.users,
      sessions: repository.sessions,
      projects: repository.projects,
      snapshots: repository,
      queue: repository,
      health: repository,
      eraser: repository.eraser,
      hostResolver: new FakeHostResolver(),
      allowPrivateTargets: false,
      launchesPerDay: 30,
      queueMax: 20,
      adminEmails: [],
    });
    const launch = () =>
      app.inject({
        method: 'POST',
        url: '/audits',
        payload: { url: 'https://site.test/', limit: 50 },
        headers: { 'x-session-id': 'session-alice' },
      });

    try {
      const responses = await Promise.all([launch(), launch()]);

      expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([202, 409]);
      expect(await repository.countQueued()).toBe(1);
    } finally {
      await app.close();
    }
  });
});
