import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInterruptController } from '../../src/cli/interrupt-controller.js';
import { runCli, type CliHooks, type CliIo } from '../../src/cli/run-cli.js';
import { createStorage, type Storage } from '../../src/composition/storage.js';
import { startFixtureServer } from '../support/fixture-server.js';

const PAGE = { status: 200, headers: { 'content-type': 'text/html' }, body: '<html></html>' };
const LOCAL_ENV = { ZERO_AUDIT_ALLOW_PRIVATE_TARGETS: 'true', ZERO_AUDIT_DELAY_MS: '0' };

const capture = (): { io: CliIo; err: () => string } => {
  let err = '';
  return {
    io: {
      stdout: () => undefined,
      stderr: (text) => {
        err += text;
      },
      stderrIsTty: false,
    },
    err: () => err,
  };
};

describe('runCli worker', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zero-audit-worker-'));
    dbPath = join(dir, 'audit.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const seedAudit = async (rootUrl: string) => {
    const seeded = await createStorage({ store: 'sqlite', dbPath, databaseUrl: null });
    const project = await seeded.projects.findOrCreateByRootUrl({
      ownerId: null,
      rootUrl,
      createdAt: new Date(),
    });
    const queued = await seeded.queue.enqueue(
      { projectId: project.id, launchedBy: null, pagesLimit: 5, requestedAt: new Date() },
      () => Promise.resolve(),
    );
    await seeded.close();
    return queued.id;
  };

  const startWorker = (env: Record<string, string>, hooks: Partial<CliHooks> = {}) => {
    const held: { storage: Storage | null; stop: () => Promise<void> } = {
      storage: null,
      stop: () => Promise.resolve(),
    };
    const run = capture();
    const running = runCli(['worker', '--db', dbPath], env, run.io, {
      onStorageOpened: (storage) => {
        held.storage = storage;
      },
      onWorkerProcessStarted: (worker) => {
        held.stop = () => worker.stop();
      },
      ...hooks,
    });
    return { held, running, run };
  };

  const statusOf = async (storage: Storage | null, id: string) =>
    (await storage?.snapshots.getById(id))?.snapshot.status;

  it('processes the queued audits until it is stopped, then exits 0', async () => {
    const fixtures = await startFixtureServer({ '/': PAGE });
    const id = await seedAudit(`${fixtures.baseUrl}/`);
    const { held, running } = startWorker(LOCAL_ENV);

    await vi.waitFor(
      async () => {
        expect(await statusOf(held.storage, id)).toBe('finished');
      },
      { timeout: 8000 },
    );
    await held.stop();

    expect(await running).toBe(0);
    await fixtures.close();
  });

  it('keeps the SSRF guard on unless ZERO_AUDIT_ALLOW_PRIVATE_TARGETS is true', async () => {
    const fixtures = await startFixtureServer({ '/': PAGE });
    const id = await seedAudit(`${fixtures.baseUrl}/`);
    const { held, running } = startWorker({ ZERO_AUDIT_DELAY_MS: '0' });

    await vi.waitFor(
      async () => {
        expect(await statusOf(held.storage, id)).toBe('failed');
      },
      { timeout: 8000 },
    );
    await held.stop();
    await running;
    await fixtures.close();

    expect(fixtures.requests).toEqual([]);
  });

  it('exits with a message and no storage opened when the concurrency is invalid', async () => {
    const { running, run, held } = startWorker({ ZERO_AUDIT_WORKER_CONCURRENCY: 'x' });

    expect(await running).toBe(2);
    expect(run.err()).toContain('ZERO_AUDIT_WORKER_CONCURRENCY');
    expect(held.storage).toBeNull();
  });

  it('puts the running audit back in the queue on SIGTERM and exits 0', async () => {
    const fixtures = await startFixtureServer({
      '/': { ...PAGE, body: '<html><body><a href="/a">a</a><a href="/b">b</a></body></html>' },
    });
    const id = await seedAudit(`${fixtures.baseUrl}/`);
    const exits: number[] = [];
    const controller = createInterruptController((code) => {
      exits.push(code);
    });
    const { held, running } = startWorker(
      { ...LOCAL_ENV, ZERO_AUDIT_DELAY_MS: '300' },
      {
        onStorageOpened: (storage) => {
          held.storage = storage;
          controller.onStorageOpened(storage);
        },
        onWorkerProcessStarted: (worker) => {
          controller.onWorkerProcessStarted(worker);
        },
      },
    );
    await vi.waitFor(async () => {
      expect(await statusOf(held.storage, id)).toBe('running');
    });

    await controller.terminate();
    await running;
    await fixtures.close();

    expect(exits).toEqual([0]);
    const reopened = await createStorage({ store: 'sqlite', dbPath, databaseUrl: null });
    const details = await reopened.snapshots.getById(id);
    await reopened.close();
    expect(details?.snapshot).toMatchObject({ status: 'queued', attempts: 1 });
  });

  it('exits 0 on SIGINT as well', async () => {
    const exits: number[] = [];
    const controller = createInterruptController((code) => {
      exits.push(code);
    });
    const { running } = startWorker(LOCAL_ENV, {
      onStorageOpened: (storage) => {
        controller.onStorageOpened(storage);
      },
      onWorkerProcessStarted: (worker) => {
        controller.onWorkerProcessStarted(worker);
      },
    });
    await vi.waitFor(() => {
      expect(exits).toEqual([]);
    });

    await controller.interrupt();
    await running;

    expect(exits).toEqual([0]);
  });
});
