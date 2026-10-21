import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditRunner } from '../../src/application/audit-runner.js';
import { createRunAudit } from '../../src/cli/audit-factory.js';
import { SESSION_TTL_MS } from '../../src/domain/session.js';
import { idleAccountDependencies, NOW } from '../support/auth-doubles.js';
import { buildServer } from '../../src/http/server.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { SystemClock } from '../../src/infrastructure/system-clock.js';
import { FakeHostResolver } from '../support/audit-doubles.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';

interface Launched {
  snapshotId: string;
  projectId: string;
}

describe('audit launched through the API against a local fixture site', () => {
  let fixtures: FixtureServer | null = null;

  afterEach(async () => {
    await fixtures?.close();
  });

  it('answers 202, then reports the audit as finished', async () => {
    fixtures = await startFixtureServer({
      '/': { status: 200, headers: { 'content-type': 'text/html' }, body: '<html></html>' },
    });
    const projects = new InMemoryProjectRepository();
    const snapshots = new InMemorySnapshotRepository();
    const runner = new AuditRunner({
      createRunAudit: (events) =>
        createRunAudit({
          storage: { projects, snapshots },
          events,
          blockPrivateAddresses: false,
        }),
      snapshots,
      projects,
      clock: new SystemClock(),
      logger: { info: () => undefined, error: () => undefined },
      delayMs: 0,
    });
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
      auditRunner: runner,
      hostResolver: new FakeHostResolver(),
      allowPrivateTargets: true,
      launchesPerDay: 30,
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
      await vi.waitFor(async () => {
        const progress = await app.inject({
          url: `/snapshots/${snapshotId}/progress`,
          headers: { 'x-session-id': 'session-alice' },
        });
        expect(progress.json()).toMatchObject({ status: 'finished', pagesCrawled: 1 });
      });
    } finally {
      await runner.stop();
      await app.close();
    }
  });
});
