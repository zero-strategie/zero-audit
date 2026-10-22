import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RootUnreachable } from '../../src/domain/errors.js';
import { createAuditWorker, createRunAudit } from '../../src/composition/audit.js';
import { createStorage } from '../../src/composition/storage.js';
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

  it('blocks private addresses in createAuditWorker when no network option is given', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zero-audit-defaults-'));
    const storage = await createStorage({
      store: 'sqlite',
      databaseUrl: null,
      dbPath: join(dir, 'audit.db'),
    });
    const project = await storage.projects.findOrCreateByRootUrl({
      ownerId: null,
      rootUrl: `${server.baseUrl}/`,
      createdAt: new Date(),
    });
    const queued = await storage.queue.enqueue(
      { projectId: project.id, launchedBy: null, pagesLimit: 5, requestedAt: new Date() },
      () => Promise.resolve(),
    );
    const worker = createAuditWorker({
      storage,
      logger: { info: () => undefined, error: () => undefined },
      delayMs: 0,
      concurrency: 1,
    });
    const stop = new AbortController();
    const running = worker.run(stop.signal);

    await vi.waitFor(
      async () => {
        expect((await storage.snapshots.getById(queued.id))?.snapshot.status).toBe('failed');
      },
      { timeout: 8000 },
    );
    stop.abort();
    await running;
    await storage.close();
    rmSync(dir, { recursive: true, force: true });

    expect(server.requests).toEqual([]);
  });
});
