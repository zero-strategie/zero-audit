import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RootUnreachable } from '../../src/domain/errors.js';
import { createRunAudit } from '../../src/composition/audit.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';

const PAGE = {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: '<html><head><title>Page de test pour le crawler</title></head><body><h1>Titre</h1></body></html>',
};

describe('network defaults of the composition', () => {
  let server: FixtureServer;

  beforeEach(async () => {
    server = await startFixtureServer({ '/': PAGE });
  });

  afterEach(async () => {
    await server.close();
  });

  it('blocks private addresses in createRunAudit when no network option is given', async () => {
    const runAudit = createRunAudit({
      storage: {
        projects: new InMemoryProjectRepository(),
        snapshots: new InMemorySnapshotRepository(),
      },
      events: { started: () => undefined, finished: () => undefined, failed: () => undefined },
    });

    await expect(
      runAudit.execute({ rootUrl: `${server.baseUrl}/`, limit: 5, delayMs: 0 }),
    ).rejects.toThrow(RootUnreachable);
  });
});
