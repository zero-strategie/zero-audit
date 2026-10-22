import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStorage, redactDatabaseUrl } from '../../src/composition/storage.js';
import { TEST_DATABASE_URL } from '../support/postgres-test-database.js';

describe('redactDatabaseUrl', () => {
  it('replaces the password and keeps the rest of the URL', () => {
    expect(redactDatabaseUrl('postgresql://zero:s3cret@db.test:5432/audit')).toBe(
      'postgresql://zero:***@db.test:5432/audit',
    );
  });

  it('leaves a URL without password unchanged', () => {
    expect(redactDatabaseUrl('postgresql://db.test/audit')).toBe('postgresql://db.test/audit');
  });

  it('never echoes an unparsable value', () => {
    expect(redactDatabaseUrl('not a url, pw=s3cret')).toBe('<invalid URL>');
  });
});

describe('createStorage', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zero-audit-storage-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('opens a SQLite storage that persists projects and closes only once', async () => {
    const storage = await createStorage({
      store: 'sqlite',
      databaseUrl: null,
      dbPath: join(dir, 'audit.db'),
    });
    const project = await storage.projects.findOrCreateByRootUrl({
      ownerId: null,
      rootUrl: 'https://x.test/',
      createdAt: new Date(),
    });
    expect(await storage.projects.getById(project.id)).toEqual(project);

    await storage.close();
    await expect(storage.close()).resolves.toBeUndefined();
  });

  it('exposes the SQLite connection with the account tables created by the migrations', async () => {
    const storage = await createStorage({
      store: 'sqlite',
      databaseUrl: null,
      dbPath: join(dir, 'audit.db'),
    });

    expect(storage.connection.kind).toBe('sqlite');
    if (storage.connection.kind !== 'sqlite') throw new Error('expected a SQLite connection');
    expect(storage.connection.db.prepare('SELECT count(*) AS n FROM users').get()).toEqual({
      n: 0,
    });
    await storage.close();
  });

  it('fails on an unreachable Postgres without leaking the password', async () => {
    const url = 'postgresql://zero:s3cret-pw@127.0.0.1:1/audit';

    const failure = await createStorage({ store: 'postgres', databaseUrl: url, dbPath: '' }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain('127.0.0.1');
    expect(message).not.toContain('s3cret-pw');
  });
});

describe.skipIf(TEST_DATABASE_URL === undefined)('createStorage with Postgres', () => {
  const open = () =>
    createStorage({ store: 'postgres', databaseUrl: TEST_DATABASE_URL ?? null, dbPath: '' });

  it('exposes the Postgres pool with the account tables created by the migrations', async () => {
    const storage = await open();

    expect(storage.connection.kind).toBe('postgres');
    if (storage.connection.kind !== 'postgres') throw new Error('expected a Postgres connection');
    await expect(
      storage.connection.pool.query('SELECT count(*) FROM users'),
    ).resolves.toBeDefined();
    await storage.close();
  });

  it('closes the pool only once when close is called twice in sequence', async () => {
    const storage = await open();

    await storage.close();

    await expect(storage.close()).resolves.toBeUndefined();
  });

  it('closes the pool only once when close is called concurrently', async () => {
    const storage = await open();

    await expect(Promise.all([storage.close(), storage.close()])).resolves.toEqual([
      undefined,
      undefined,
    ]);
  });
});
