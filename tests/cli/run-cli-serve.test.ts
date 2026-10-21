import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInterruptController } from '../../src/cli/interrupt-controller.js';
import { runCli, type CliHooks, type CliIo } from '../../src/cli/run-cli.js';
import { createStorage, type Storage, type StorageFactory } from '../../src/cli/storage-factory.js';
import type { HttpServer, ServerDependencies } from '../../src/http/server.js';
import { LEGACY_ORPHAN_AGE_MS } from '../../src/application/legacy-orphan-age.js';
import { HEARTBEAT_STALE_MS } from '../../src/domain/snapshot.js';
import type { AuditRunner } from '../../src/application/audit-runner.js';
import { startFixtureServer } from '../support/fixture-server.js';

interface ListenCall {
  host: string;
  port: number;
}

const fakeServer = (
  events: string[],
  listenFailure?: Error,
): HttpServer & { calls: ListenCall[] } => {
  const calls: ListenCall[] = [];
  return {
    calls,
    listen: (options) => {
      calls.push(options);
      events.push('listen');
      return listenFailure ? Promise.reject(listenFailure) : Promise.resolve();
    },
    close: () => {
      events.push('server-close');
      return Promise.resolve();
    },
  };
};

const capture = (): { io: CliIo; out: () => string; err: () => string } => {
  let out = '';
  let err = '';
  return {
    io: {
      stdout: (text) => {
        out += text;
      },
      stderr: (text) => {
        err += text;
      },
      stderrIsTty: false,
    },
    out: () => out,
    err: () => err,
  };
};

describe('runCli serve', () => {
  let dir: string;
  let dbPath: string;
  let events: string[];
  let storageCloses: number;
  let closeResults: Promise<void>[];

  const storageFactory: StorageFactory = async (config) => {
    const real = await createStorage(config);
    return {
      projects: real.projects,
      snapshots: real.snapshots,
      queue: real.queue,
      health: real.health,
      users: real.users,
      sessions: real.sessions,
      emailTokens: real.emailTokens,
      eraser: real.eraser,
      close: () => {
        storageCloses += 1;
        const result = real.close();
        closeResults.push(result);
        return result;
      },
    };
  };

  const serve = (
    args: string[],
    server: HttpServer,
    hooks: Partial<CliHooks> = {},
    io: CliIo = capture().io,
    env: Record<string, string> = {},
  ) =>
    runCli(['serve', '--db', dbPath, ...args], env, io, {
      storageFactory,
      createServer: () => server,
      untilStopped: Promise.resolve(),
      ...hooks,
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zero-audit-serve-'));
    dbPath = join(dir, 'audit.db');
    events = [];
    storageCloses = 0;
    closeResults = [];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('listens on 127.0.0.1:3000 by default', async () => {
    const server = fakeServer(events);

    expect(await serve([], server)).toBe(0);

    expect(server.calls).toEqual([{ host: '127.0.0.1', port: 3000 }]);
  });

  it('listens on the host and port given by HOST and PORT', async () => {
    const server = fakeServer(events);

    await serve([], server, {}, capture().io, { HOST: '0.0.0.0', PORT: '8080' });

    expect(server.calls).toEqual([{ host: '0.0.0.0', port: 8080 }]);
  });

  it('listens on the port given by --port', async () => {
    const server = fakeServer(events);

    await serve(['--port', '4000'], server);

    expect(server.calls).toEqual([{ host: '127.0.0.1', port: 4000 }]);
  });

  describe('account dependencies given to the server', () => {
    const dependenciesOf = async (
      env: Record<string, string> = {},
    ): Promise<ServerDependencies> => {
      const received: ServerDependencies[] = [];
      await serve(
        [],
        fakeServer(events),
        {
          createServer: (dependencies) => {
            received.push(dependencies);
            return fakeServer(events);
          },
        },
        capture().io,
        env,
      );
      const [dependencies] = received;
      if (!dependencies) throw new Error('the server was not built');
      return dependencies;
    };

    it('keeps the mailer disabled and has no administrator by default', async () => {
      const dependencies = await dependenciesOf();

      expect(dependencies.mailer.enabled).toBe(false);
      expect(dependencies.adminEmails).toEqual([]);
    });

    it('wires the console mailer, the administrators and the public URL from the environment', async () => {
      const dependencies = await dependenciesOf({
        ZERO_AUDIT_MAILER: 'console',
        ZERO_AUDIT_ADMIN_EMAILS: 'Admin@Exemple.test',
        ZERO_AUDIT_PUBLIC_URL: 'https://audit.exemple.test',
      });

      expect(dependencies.mailer.enabled).toBe(true);
      expect(dependencies.adminEmails).toEqual(['admin@exemple.test']);
      expect(dependencies.publicUrl).toBe('https://audit.exemple.test');
    });

    it('points the links at the local dashboard when no public URL is set', async () => {
      expect((await dependenciesOf()).publicUrl).toBe('http://127.0.0.1:4321');
    });

    it('stores accounts in the opened storage', async () => {
      const opened: Storage[] = [];
      const received: ServerDependencies[] = [];

      await serve([], fakeServer(events), {
        onStorageOpened: (storage) => opened.push(storage),
        createServer: (dependencies) => {
          received.push(dependencies);
          return fakeServer(events);
        },
      });

      expect(received[0]?.users).toBe(opened[0]?.users);
      expect(received[0]?.sessions).toBe(opened[0]?.sessions);
      expect(received[0]?.emailTokens).toBe(opened[0]?.emailTokens);
      expect(received[0]?.eraser).toBe(opened[0]?.eraser);
    });
  });

  it('warns that the console mailer is forbidden in production', async () => {
    const run = capture();

    await serve([], fakeServer(events), {}, run.io, { ZERO_AUDIT_MAILER: 'console' });

    expect(run.err()).toContain('mailer console : interdit en production');
  });

  it('does not warn about the mailer by default', async () => {
    const run = capture();

    await serve([], fakeServer(events), {}, run.io);

    expect(run.err()).not.toContain('mailer');
  });

  it('prints an error and exits non-zero for an invalid port, without starting anything', async () => {
    const server = fakeServer(events);
    const run = capture();

    const code = await serve(['--port', 'abc'], server, {}, run.io);

    expect(code).not.toBe(0);
    expect(run.err()).toContain('--port');
    expect(events).toEqual([]);
    expect(storageCloses).toBe(0);
  });

  it('fails with a message naming PORT when PORT is invalid', async () => {
    const run = capture();

    const code = await serve([], fakeServer(events), {}, run.io, { PORT: '70000' });

    expect(code).not.toBe(0);
    expect(run.err()).toContain('PORT');
    expect(events).toEqual([]);
  });

  it('closes the server then the storage when it stops', async () => {
    await serve([], fakeServer(events), {
      storageFactory: async (config) => {
        const storage = await storageFactory(config);
        return {
          ...storage,
          close: async () => {
            events.push('storage-close');
            await storage.close();
          },
        };
      },
    });

    expect(events).toEqual(['listen', 'server-close', 'storage-close']);
  });

  it('fails with a message and releases the storage when the port cannot be bound', async () => {
    const run = capture();

    const code = await serve([], fakeServer(events, new Error('EADDRINUSE')), {}, run.io);

    expect(code).toBe(1);
    expect(run.err()).toContain('EADDRINUSE');
    expect(storageCloses).toBe(1);
  });

  it('releases the storage without error when SIGINT and the end of the command both close it', async () => {
    const exits: number[] = [];
    const controller = createInterruptController((code) => {
      exits.push(code);
    });
    let stop: () => void = () => undefined;
    const untilStopped = new Promise<void>((resolve) => {
      stop = resolve;
    });
    const server = fakeServer(events);

    const running = serve([], server, {
      untilStopped,
      onStorageOpened: (storage: Storage) => {
        controller.onStorageOpened(storage);
      },
      onServerStarted: (started) => {
        controller.onServerStarted(started);
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    await controller.interrupt();
    stop();
    await running;

    expect(exits).toEqual([130]);
    expect(events).toContain('server-close');
    expect(storageCloses).toBeGreaterThan(1);
    await expect(Promise.all(closeResults)).resolves.toBeDefined();
  });

  it('recovers stale running audits at startup, and only those', async () => {
    const seeded = await createStorage({
      store: 'sqlite',
      dbPath,
      databaseUrl: null,
    });
    const project = await seeded.projects.findOrCreateByRootUrl({
      ownerId: null,
      rootUrl: 'https://exemple.com/',
      createdAt: new Date(),
    });
    const start = async (ageMs: number) => {
      await seeded.queue.enqueue(
        { projectId: project.id, launchedBy: null, pagesLimit: 100, requestedAt: new Date() },
        () => Promise.resolve(),
      );
      const claimed = await seeded.queue.claimNext('seed', new Date(Date.now() - ageMs));
      if (!claimed) throw new Error('nothing claimed');
      return claimed;
    };
    const old = await start(HEARTBEAT_STALE_MS + 60_000);
    const recent = await start(HEARTBEAT_STALE_MS - 60_000);
    const orphan = await seeded.snapshots.create({
      projectId: project.id,
      launchedBy: null,
      pagesLimit: 100,
      startedAt: new Date(Date.now() - LEGACY_ORPHAN_AGE_MS - 60_000),
    });
    await seeded.close();
    let statuses: string[] = [];

    await serve([], fakeServer(events), {
      storageFactory: async (config) => {
        const storage = await storageFactory(config);
        return {
          ...storage,
          close: async () => {
            statuses = [
              (await storage.snapshots.getById(old.id))?.snapshot.status ?? '',
              (await storage.snapshots.getById(recent.id))?.snapshot.status ?? '',
              (await storage.snapshots.getById(orphan.id))?.snapshot.status ?? '',
            ];
            await storage.close();
          },
        };
      },
    });

    expect(statuses).toEqual(['queued', 'running', 'failed']);
  });

  describe('purge of stale accounts', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    const seed = async () => {
      const seeded = await createStorage({ store: 'sqlite', dbPath, databaseUrl: null });
      const now = Date.now();
      const stale = await seeded.users.create({
        email: 'stale@exemple.test',
        passwordHash: 'h',
        createdAt: new Date(now - 8 * DAY_MS),
      });
      const recent = await seeded.users.create({
        email: 'recent@exemple.test',
        passwordHash: 'h',
        createdAt: new Date(now - DAY_MS),
      });
      await seeded.sessions.create({
        id: 'expired-session',
        userId: recent.id,
        createdAt: new Date(now - 2 * DAY_MS),
        expiresAt: new Date(now - DAY_MS),
      });
      await seeded.close();
      return { stale, recent };
    };

    it('removes unverified accounts older than 7 days and expired sessions at startup', async () => {
      const { stale, recent } = await seed();
      let outcome: unknown = null;

      await serve([], fakeServer(events), {
        storageFactory: async (config) => {
          const storage = await storageFactory(config);
          return {
            ...storage,
            close: async () => {
              outcome = [
                await storage.users.findById(stale.id),
                (await storage.users.findById(recent.id))?.email,
                await storage.sessions.deleteExpired(new Date()),
              ];
              await storage.close();
            },
          };
        },
      });

      expect(outcome).toEqual([null, 'recent@exemple.test', 0]);
    });

    it('schedules the purge every day and stops the schedule when the server stops', async () => {
      const setTimer = vi.spyOn(globalThis, 'setInterval');
      const clearTimer = vi.spyOn(globalThis, 'clearInterval');

      await serve([], fakeServer(events));

      const index = setTimer.mock.calls.findIndex(([, delay]) => delay === DAY_MS);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(clearTimer).toHaveBeenCalledWith(setTimer.mock.results[index]?.value);
      setTimer.mockRestore();
      clearTimer.mockRestore();
    });
  });

  it('hands over a runner that audits a local target once private targets are allowed', async () => {
    const fixtures = await startFixtureServer({
      '/': { status: 200, headers: { 'content-type': 'text/html' }, body: '<html></html>' },
    });
    const held: { runner: AuditRunner | null } = { runner: null };
    let stop: () => void = () => undefined;
    const untilStopped = new Promise<void>((resolve) => {
      stop = resolve;
    });

    const running = serve(
      [],
      fakeServer(events),
      {
        untilStopped,
        onAuditRunnerStarted: (started) => {
          held.runner = started;
        },
      },
      capture().io,
      { ZERO_AUDIT_ALLOW_PRIVATE_TARGETS: 'true', ZERO_AUDIT_DELAY_MS: '0' },
    );
    await vi.waitFor(() => {
      expect(held.runner).not.toBeNull();
    });
    const started = await held.runner?.start({
      rootUrl: `${fixtures.baseUrl}/`,
      limit: 5,
    });
    await vi.waitFor(async () => {
      expect(await held.runner?.progress(started?.snapshotId ?? '')).toMatchObject({
        status: 'finished',
        pagesCrawled: 1,
      });
    });
    stop();
    await running;
    await fixtures.close();
  });
});
