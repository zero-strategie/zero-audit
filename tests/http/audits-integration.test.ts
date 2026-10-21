import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditRunner } from '../../src/application/audit-runner.js';
import { createRunAudit } from '../../src/cli/audit-factory.js';
import { idleAccountDependencies } from '../support/auth-doubles.js';
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
    const app = buildServer({
      ...idleAccountDependencies(),
      projects,
      snapshots,
      health: snapshots,
      auditRunner: runner,
      hostResolver: new FakeHostResolver(),
      allowPrivateTargets: true,
    });

    try {
      const launched = await app.inject({
        method: 'POST',
        url: '/audits',
        payload: { url: `${fixtures.baseUrl}/`, limit: 50 },
      });

      expect(launched.statusCode).toBe(202);
      const { snapshotId } = launched.json<Launched>();
      await vi.waitFor(async () => {
        const progress = await app.inject(`/snapshots/${snapshotId}/progress`);
        expect(progress.json()).toMatchObject({ status: 'finished', pagesCrawled: 1 });
      });
    } finally {
      await runner.stop();
      await app.close();
    }
  });
});
