import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../../src/cli/run-cli.js';
import { createStorage } from '../../src/composition/storage.js';

const HOST = 'worker-host';
const NOW = new Date('2026-03-01T12:00:00.000Z');
const clock = { now: () => NOW.getTime() };
const secondsBefore = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

describe('runCli worker-health', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zero-audit-health-'));
    dbPath = join(dir, 'audit.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const present = async (workerId: string, seenAt: Date) => {
    const storage = await createStorage({ store: 'sqlite', dbPath, databaseUrl: null });
    await storage.queue.recordWorkerPresence(workerId, seenAt);
    await storage.close();
  };

  const health = async (env: Record<string, string> = {}) => {
    let err = '';
    const io: CliIo = {
      stdout: () => undefined,
      stderr: (text) => {
        err += text;
      },
      stderrIsTty: false,
    };
    const code = await runCli(['worker-health', '--db', dbPath], env, io, {
      clock,
      hostname: HOST,
    });
    return { code, err };
  };

  it('exits 0 when the worker of the host was seen less than 60 s ago', async () => {
    await present(HOST, secondsBefore(59));

    expect((await health()).code).toBe(0);
  });

  it('exits 1 when the worker of the host was seen 60 s ago or more', async () => {
    await present(HOST, secondsBefore(60));

    expect((await health()).code).toBe(1);
  });

  it('exits 1 with a message when no presence was ever recorded', async () => {
    const { code, err } = await health();

    expect(code).toBe(1);
    expect(err).toContain('aucun worker actif');
  });

  it('ignores the presence of another host', async () => {
    await present('other-host', secondsBefore(1));

    expect((await health()).code).toBe(1);
  });

  it('accepts any lane of a worker running several audits at once', async () => {
    await present(`${HOST}-2`, secondsBefore(5));

    expect((await health({ ZERO_AUDIT_WORKER_CONCURRENCY: '2' })).code).toBe(0);
  });

  it('exits 2 on an invalid concurrency', async () => {
    expect((await health({ ZERO_AUDIT_WORKER_CONCURRENCY: '0' })).code).toBe(2);
  });
});
