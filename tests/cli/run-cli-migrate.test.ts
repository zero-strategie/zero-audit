import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run-cli.js';
import {
  createTestDatabase,
  TEST_DATABASE_URL,
  type TestDatabase,
} from '../support/postgres-test-database.js';

const run = async (args: string[], env: Record<string, string> = {}) => {
  let out = '';
  let err = '';
  const code = await runCli(args, env, {
    stdout: (text) => {
      out += text;
    },
    stderr: (text) => {
      err += text;
    },
    stderrIsTty: false,
  });
  return { code, out, err };
};

describe('runCli migrate', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zero-audit-migrate-'));
    dbPath = join(dir, 'audit.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies every SQLite migration on an empty database and exits 0', async () => {
    const { code } = await run(['migrate', '--store', 'sqlite', '--db', dbPath]);

    expect(code).toBe(0);
    const db = new Database(dbPath, { readonly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    const version = db.prepare('SELECT MAX(version) AS version FROM schema_version').get();
    db.close();
    expect(tables).toEqual(expect.arrayContaining([{ name: 'snapshots' }, { name: 'projects' }]));
    expect(version).toEqual({ version: 8 });
  });

  it('creates nothing but the database file (no server, no snapshot)', async () => {
    await run(['migrate', '--db', dbPath]);

    const db = new Database(dbPath, { readonly: true });
    expect(db.prepare('SELECT COUNT(*) AS n FROM snapshots').get()).toEqual({ n: 0 });
    db.close();
    expect(existsSync(dbPath)).toBe(true);
  });

  it('exits 2 with the usage on an unknown option', async () => {
    const { code, err } = await run(['migrate', '--foo']);

    expect(code).toBe(2);
    expect(err).toContain('Usage');
  });

  it('fails without DATABASE_URL for postgres, with a clear message', async () => {
    const { code, err } = await run(['migrate'], { ZERO_AUDIT_STORE: 'postgres' });

    expect(code).not.toBe(0);
    expect(err).toContain('DATABASE_URL');
  });

  it('exits 1 without leaking the password of an unreachable DATABASE_URL', async () => {
    const { code, err } = await run(['migrate', '--store', 'postgres'], {
      DATABASE_URL: 'postgresql://zero:s3cret-pw@127.0.0.1:1/audit',
    });

    expect(code).toBe(1);
    expect(err).toContain('127.0.0.1');
    expect(err).not.toContain('s3cret-pw');
  });
});

describe.skipIf(TEST_DATABASE_URL === undefined)('runCli migrate on Postgres', () => {
  let database: TestDatabase;
  let databaseUrl: string;

  beforeEach(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    const url = new URL(TEST_DATABASE_URL ?? '');
    url.searchParams.set('options', `-c search_path=${database.schema}`);
    databaseUrl = url.toString();
  });

  afterEach(async () => {
    await database.dispose();
  });

  it('applies the migrations, then a second run replays none', async () => {
    const env = { DATABASE_URL: databaseUrl };
    const appliedAt = async (): Promise<unknown[]> => {
      const client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        const { rows } = await client.query(
          'SELECT version, applied_at FROM schema_migrations ORDER BY version',
        );
        return rows as unknown[];
      } finally {
        await client.end();
      }
    };

    const first = await run(['migrate', '--store', 'postgres'], env);
    const afterFirst = await appliedAt();
    const second = await run(['migrate', '--store', 'postgres'], env);

    expect([first.code, second.code]).toEqual([0, 0]);
    expect(afterFirst).toHaveLength(3);
    expect(await appliedAt()).toEqual(afterFirst);
  });
});
