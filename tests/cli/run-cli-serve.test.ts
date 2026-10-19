import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInterruptController } from '../../src/cli/interrupt-controller.js';
import { runCli, type CliHooks, type CliIo } from '../../src/cli/run-cli.js';
import { createStorage, type Storage, type StorageFactory } from '../../src/cli/storage-factory.js';
import type { HttpServer } from '../../src/http/server.js';

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
});
