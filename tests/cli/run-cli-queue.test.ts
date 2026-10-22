import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInterruptController } from '../../src/cli/interrupt-controller.js';
import { runCli, type CliHooks, type CliIo } from '../../src/cli/run-cli.js';
import { createStorage } from '../../src/composition/storage.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';

const PAGE = { status: 200, headers: { 'content-type': 'text/html' }, body: '<html></html>' };
const LOCAL_ENV = { ZERO_AUDIT_ALLOW_PRIVATE_TARGETS: 'true', ZERO_AUDIT_DELAY_MS: '0' };
const FAST_POLL = { sleep: () => new Promise<void>((resolve) => setTimeout(resolve, 20)) };

interface Captured {
  io: CliIo;
  out: string;
  err: string;
}

const capture = (): Captured => {
  const captured: Captured = {
    out: '',
    err: '',
    io: {
      stdout: (text) => {
        captured.out += text;
      },
      stderr: (text) => {
        captured.err += text;
      },
      stderrIsTty: false,
    },
  };
  return captured;
};

describe('runCli audit through the queue', () => {
  let server: FixtureServer;
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    server = await startFixtureServer({ '/': PAGE });
    dir = mkdtempSync(join(tmpdir(), 'zero-audit-queue-'));
    dbPath = join(dir, 'audit.db');
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const rows = <T>(sql: string): T[] => {
    const db = new Database(dbPath, { readonly: true });
    try {
      return db.prepare(sql).all() as T[];
    } finally {
      db.close();
    }
  };

  const startWorker = (hooks: Partial<CliHooks> = {}, env: Record<string, string> = LOCAL_ENV) => {
    let stop = () => Promise.resolve();
    const running = runCli(['worker', '--db', dbPath], env, capture().io, {
      onWorkerProcessStarted: (worker) => {
        stop = () => worker.stop();
      },
      ...hooks,
    });
    return { stop: () => stop(), running };
  };

  describe('without flag', () => {
    it('queues an ownerless snapshot, prints its id and position, crawls nothing and exits 0', async () => {
      const run = capture();

      const code = await runCli([server.baseUrl, '--db', dbPath, '--limit', '7'], {}, run.io);

      expect(code).toBe(0);
      const [snapshot] = rows<{
        id: string;
        status: string;
        launched_by: null;
        pages_limit: number;
      }>('SELECT id, status, launched_by, pages_limit FROM snapshots');
      expect(snapshot).toMatchObject({ status: 'queued', launched_by: null, pages_limit: 7 });
      expect(run.out).toContain(snapshot?.id);
      expect(run.out).toContain('position 1');
      expect(rows('SELECT owner_id FROM projects')).toEqual([{ owner_id: null }]);
      expect(server.requests).toEqual([]);
    });

    it('queues even when 20 audits are already waiting', async () => {
      for (let index = 0; index < 20; index += 1) {
        await runCli([`${server.baseUrl}/site-${String(index)}`, '--db', dbPath], {}, capture().io);
      }
      const run = capture();

      const code = await runCli(
        [server.baseUrl, '--db', dbPath],
        { ZERO_AUDIT_QUEUE_MAX: '20' },
        run.io,
      );

      expect(code).toBe(0);
      expect(rows('SELECT id FROM snapshots')).toHaveLength(21);
      expect(run.out).toContain('position 21');
    });
  });

  describe('--wait', () => {
    it('prints the summary and the JSON export once a worker finished the audit, and exits 0', async () => {
      const jsonPath = join(dir, 'out.json');
      const worker = startWorker();
      const run = capture();

      const code = await runCli(
        [server.baseUrl, '--wait', '--db', dbPath, '--json', jsonPath],
        {},
        run.io,
        { sleeper: FAST_POLL },
      );
      await worker.stop();
      await worker.running;

      expect(code).toBe(0);
      expect(run.out).toContain('Santé du site');
      const exported = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
        snapshot: { status: string };
      };
      expect(exported.snapshot.status).toBe('finished');
    });

    it('exits 1 when the audit ends failed', async () => {
      const worker = startWorker({}, { ZERO_AUDIT_DELAY_MS: '0' });
      const run = capture();

      const code = await runCli([server.baseUrl, '--wait', '--db', dbPath], {}, run.io, {
        sleeper: FAST_POLL,
      });
      await worker.stop();
      await worker.running;

      expect(code).toBe(1);
      expect(run.err).toContain('Audit échoué');
      expect(run.out).not.toContain('Santé du site');
    });

    it('warns that no worker is active, then keeps waiting', async () => {
      const run = capture();
      let polls = 0;
      const started: { worker?: ReturnType<typeof startWorker> } = {};
      const sleeper = {
        sleep: async () => {
          polls += 1;
          started.worker ??= startWorker();
          await FAST_POLL.sleep();
        },
      };

      const code = await runCli([server.baseUrl, '--wait', '--db', dbPath], {}, run.io, {
        sleeper,
        hostname: 'nobody-here',
      });
      await started.worker?.stop();
      await started.worker?.running;

      expect(run.err).toContain('aucun worker actif');
      expect(polls).toBeGreaterThan(0);
      expect(code).toBe(0);
    });

    it('does not warn when a worker of the host announced itself', async () => {
      const worker = startWorker();
      const storage = await createStorage({ store: 'sqlite', dbPath, databaseUrl: null });
      await storage.queue.recordWorkerPresence('this-host', new Date());
      await storage.close();
      const run = capture();

      await runCli([server.baseUrl, '--wait', '--db', dbPath], {}, run.io, {
        sleeper: FAST_POLL,
        hostname: 'this-host',
      });
      await worker.stop();
      await worker.running;

      expect(run.err).not.toContain('aucun worker actif');
    });

    it('leaves the audit queued on SIGINT, without a worker', async () => {
      const exits: number[] = [];
      const controller = createInterruptController((code) => {
        exits.push(code);
      });
      const run = capture();
      let interrupted: Promise<void> | null = null;
      const sleeper = {
        sleep: async () => {
          interrupted ??= controller.interrupt();
          await interrupted;
        },
      };

      await runCli([server.baseUrl, '--wait', '--db', dbPath], {}, run.io, {
        sleeper,
        onStorageOpened: (storage) => {
          controller.onStorageOpened(storage);
        },
        onAuditStarted: (id, url) => {
          controller.onAuditStarted(id, url);
        },
      });

      expect(exits).toEqual([130]);
      expect(rows('SELECT status FROM snapshots')).toEqual([{ status: 'queued' }]);
    });
  });

  describe('--direct', () => {
    it('crawls in the process and records a finished snapshot', async () => {
      const run = capture();

      const code = await runCli(
        [server.baseUrl, '--direct', '--delay', '0', '--db', dbPath],
        {},
        run.io,
      );

      expect(code).toBe(0);
      expect(rows('SELECT status FROM snapshots')).toEqual([{ status: 'finished' }]);
      expect(run.out).toContain('audit.finished');
    });

    it('marks the audit failed on SIGINT, as before', async () => {
      const slow = await startFixtureServer({
        '/': { ...PAGE, body: '<html><body><a href="/a">a</a></body></html>' },
      });
      const exits: number[] = [];
      const controller = createInterruptController((code) => {
        exits.push(code);
      });
      const run = capture();
      const running = runCli(
        [slow.baseUrl, '--direct', '--delay', '400', '--db', dbPath],
        {},
        run.io,
        {
          onStorageOpened: (storage) => {
            controller.onStorageOpened(storage);
          },
          onAuditStarted: (id, url) => {
            controller.onAuditStarted(id, url);
          },
        },
      );
      await vi.waitFor(() => {
        expect(rows('SELECT status FROM snapshots')).toEqual([{ status: 'running' }]);
      });

      await controller.interrupt();
      await running;
      await slow.close();

      expect(exits).toEqual([130]);
      expect(rows('SELECT status FROM snapshots')).toEqual([{ status: 'failed' }]);
    });
  });

  it('exits 2 with the usage for --wait and --direct together', async () => {
    const run = capture();

    const code = await runCli([server.baseUrl, '--wait', '--direct', '--db', dbPath], {}, run.io);

    expect(code).toBe(2);
    expect(run.err).toContain('Usage');
  });
});
