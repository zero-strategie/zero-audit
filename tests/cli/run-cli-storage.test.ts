import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInterruptController } from '../../src/cli/interrupt-controller.js';
import { runCli, type CliIo } from '../../src/cli/run-cli.js';
import {
  createStorage,
  type Storage,
  type StorageConfig,
  type StorageFactory,
} from '../../src/cli/storage-factory.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';
import { TEST_DATABASE_URL } from '../support/postgres-test-database.js';

const PAGE = {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: '<html><head><title>Page de test pour le crawler</title></head><body><h1>Titre</h1></body></html>',
};

const silentIo = (): { io: CliIo; err: () => string } => {
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

interface SpiedFactory {
  factory: StorageFactory;
  configs: StorageConfig[];
  closeCalls: () => number;
  /** Closes that reached the real storage: the real close() is idempotent, so a second call is a no-op. */
  effectiveCloses: () => number;
}

const spyOnFactory = (): SpiedFactory => {
  const configs: StorageConfig[] = [];
  let closes = 0;
  let effective = 0;
  const factory: StorageFactory = async (config) => {
    configs.push(config);
    const real: Storage = await createStorage(config);
    return {
      projects: real.projects,
      snapshots: real.snapshots,
      health: real.health,
      close: async () => {
        closes += 1;
        if (closes === 1) effective += 1;
        await real.close();
      },
    };
  };
  return { factory, configs, closeCalls: () => closes, effectiveCloses: () => effective };
};

describe('runCli storage wiring', () => {
  let server: FixtureServer;
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    server = await startFixtureServer({ '/': PAGE });
    dir = mkdtempSync(join(tmpdir(), 'zero-audit-cli-storage-'));
    dbPath = join(dir, 'audit.db');
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses SQLite by default and closes the storage exactly once after an audit', async () => {
    const spy = spyOnFactory();

    const code = await runCli([server.baseUrl, '--delay', '0', '--db', dbPath], {}, silentIo().io, {
      storageFactory: spy.factory,
    });

    expect(code).toBe(0);
    expect(spy.configs).toMatchObject([{ store: 'sqlite', databaseUrl: null, dbPath }]);
    expect(spy.closeCalls()).toBe(1);
  });

  it('closes the storage exactly once when the audit fails', async () => {
    const spy = spyOnFactory();

    const code = await runCli(
      ['http://127.0.0.1:1/', '--delay', '0', '--db', dbPath],
      {},
      silentIo().io,
      { storageFactory: spy.factory },
    );

    expect(code).toBe(1);
    expect(spy.closeCalls()).toBe(1);
  });

  it('closes the storage exactly once after a compare, even when it fails', async () => {
    const spy = spyOnFactory();

    const code = await runCli(
      ['compare', 'unknown-a', 'unknown-b', '--db', dbPath],
      {},
      silentIo().io,
      { storageFactory: spy.factory },
    );

    expect(code).toBe(1);
    expect(spy.closeCalls()).toBe(1);
  });

  it('closes the storage and exits 130 when interrupted during an audit', async () => {
    const spy = spyOnFactory();
    const closesAtExit: number[] = [];
    const controller = createInterruptController((code) => {
      closesAtExit.push(spy.effectiveCloses(), code);
    });
    let pending: Promise<void> = Promise.resolve();

    await runCli([server.baseUrl, '--delay', '0', '--db', dbPath], {}, silentIo().io, {
      storageFactory: spy.factory,
      onStorageOpened: (storage) => {
        controller.onStorageOpened(storage);
      },
      onAuditStarted: (id) => {
        controller.onAuditStarted(id, server.baseUrl);
        pending = controller.interrupt();
      },
    });
    await pending;

    expect(closesAtExit).toEqual([1, 130]);
    expect(spy.effectiveCloses()).toBe(1);
  });

  it('closes the storage and exits 130 when interrupted during a compare', async () => {
    const spy = spyOnFactory();
    const closesAtExit: number[] = [];
    const controller = createInterruptController((code) => {
      closesAtExit.push(spy.effectiveCloses(), code);
    });
    let pending: Promise<void> = Promise.resolve();

    await runCli(['compare', 'unknown-a', 'unknown-b', '--db', dbPath], {}, silentIo().io, {
      storageFactory: spy.factory,
      onStorageOpened: (storage) => {
        controller.onStorageOpened(storage);
        pending = controller.interrupt();
      },
    });
    await pending;

    expect(closesAtExit).toEqual([1, 130]);
    expect(spy.effectiveCloses()).toBe(1);
  });

  it('exits 2 and starts nothing for an unknown store', async () => {
    const spy = spyOnFactory();
    const run = silentIo();

    const code = await runCli([server.baseUrl, '--store', 'mysql'], {}, run.io, {
      storageFactory: spy.factory,
    });

    expect(code).toBe(2);
    expect(run.err()).toContain('sqlite, postgres');
    expect(spy.configs).toEqual([]);
  });

  it('exits 2 and starts nothing when postgres is chosen without DATABASE_URL', async () => {
    const spy = spyOnFactory();
    const run = silentIo();

    const code = await runCli([server.baseUrl, '--store', 'postgres'], {}, run.io, {
      storageFactory: spy.factory,
    });

    expect(code).toBe(2);
    expect(run.err()).toContain('DATABASE_URL');
    expect(spy.configs).toEqual([]);
  });

  it('exits 1 without leaking the password of an unreachable DATABASE_URL', async () => {
    const run = silentIo();

    const code = await runCli(
      [server.baseUrl, '--delay', '0', '--store', 'postgres'],
      { DATABASE_URL: 'postgresql://zero:s3cret-pw@127.0.0.1:1/audit' },
      run.io,
    );

    expect(code).toBe(1);
    expect(run.err()).toContain('127.0.0.1');
    expect(run.err()).not.toContain('s3cret-pw');
  });

  it.skipIf(TEST_DATABASE_URL === undefined)(
    'stores the snapshot in Postgres with --store postgres',
    async () => {
      const spy = spyOnFactory();
      const env = { DATABASE_URL: TEST_DATABASE_URL };
      let snapshotId = '';

      const code = await runCli(
        [server.baseUrl, '--delay', '0', '--store', 'postgres'],
        env,
        silentIo().io,
        {
          storageFactory: spy.factory,
          onAuditStarted: (id) => {
            snapshotId = id;
          },
        },
      );

      expect(code).toBe(0);
      const storage = await createStorage(spy.configs[0] as StorageConfig);
      try {
        const projects = await storage.projects.list();
        const project = projects.find(({ rootUrl }) => rootUrl.startsWith(server.baseUrl));
        expect(project).toBeDefined();
        const snapshot = await storage.snapshots.getById(snapshotId);
        expect(snapshot?.snapshot.status).toBe('finished');
      } finally {
        await storage.close();
      }
    },
  );
});
