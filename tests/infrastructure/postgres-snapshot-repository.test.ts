import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Link } from '../../src/domain/crawl.js';
import { SnapshotImmutable } from '../../src/domain/errors.js';
import { createPool } from '../../src/infrastructure/postgres/pool.js';
import { migrate } from '../../src/infrastructure/postgres/migrate.js';
import { PostgresSnapshotRepository } from '../../src/infrastructure/postgres/postgres-snapshot-repository.js';
import { describeProjectRepositoryContract } from '../support/project-repository-contract.js';
import {
  createTestDatabase,
  TEST_DATABASE_URL,
  type TestDatabase,
} from '../support/postgres-test-database.js';
import {
  type AccountStorage,
  describeAccountEraserContract,
  seedAccount,
  seedProject,
} from '../support/account-eraser-contract.js';
import { describeEmailTokenRepositoryContract } from '../support/email-token-repository-contract.js';
import { describeSessionRepositoryContract } from '../support/session-repository-contract.js';
import { describeSnapshotRepositoryContract } from '../support/snapshot-repository-contract.js';
import { describeUserRepositoryContract } from '../support/user-repository-contract.js';

const startedAt = new Date('2026-01-01T10:00:00.123Z');

interface ProjectRow {
  id: string;
  root_url: string;
  owner_id: string | null;
}
const CONTENT_TABLES =
  'pages, links, site_files, host_probes, slash_probes, check_results, issue_occurrences, snapshots, projects, email_tokens, sessions, users, api_launches';

const readMigration = (file: string): string =>
  readFileSync(
    join(import.meta.dirname, '../../src/infrastructure/postgres/migrations', file),
    'utf8',
  );

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, nested: unknown) =>
    nested !== null && typeof nested === 'object' && !Array.isArray(nested)
      ? Object.fromEntries(
          Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)),
        )
      : nested,
  );

describe.skipIf(!TEST_DATABASE_URL)('PostgresSnapshotRepository', () => {
  let database: TestDatabase;
  let repository: PostgresSnapshotRepository;

  beforeAll(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    await migrate(database.pool);
    repository = new PostgresSnapshotRepository(database.pool);
  });

  beforeEach(async () => {
    await database.pool.query(`TRUNCATE ${CONTENT_TABLES} RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await database.dispose();
  });

  describeSnapshotRepositoryContract(() => ({
    snapshots: repository,
    projects: repository.projects,
    users: repository.users,
  }));
  describeProjectRepositoryContract(() => ({
    projects: repository.projects,
    users: repository.users,
  }));
  describeUserRepositoryContract(() => repository.users);
  describeSessionRepositoryContract(() => ({
    sessions: repository.sessions,
    users: repository.users,
  }));
  describeEmailTokenRepositoryContract(() => ({
    emailTokens: repository.emailTokens,
    users: repository.users,
  }));

  const storage = (): AccountStorage => ({
    users: repository.users,
    projects: repository.projects,
    snapshots: repository,
    sessions: repository.sessions,
    emailTokens: repository.emailTokens,
    eraser: repository.eraser,
  });
  describeAccountEraserContract(storage);

  describe('secrets at rest', () => {
    const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

    it('stores the SHA-256 of a session identifier, never the identifier', async () => {
      const user = await repository.users.create({
        email: 'u@example.fr',
        passwordHash: 'h',
        createdAt: startedAt,
      });
      await repository.sessions.create({
        id: 'raw-session-id',
        userId: user.id,
        createdAt: startedAt,
        expiresAt: startedAt,
      });

      const { rows } = await database.pool.query('SELECT * FROM sessions');

      expect(JSON.stringify(rows)).toContain(sha256('raw-session-id'));
      expect(JSON.stringify(rows)).not.toContain('raw-session-id');
    });

    it('stores the SHA-256 of an e-mail token, never the token', async () => {
      const user = await repository.users.create({
        email: 'u@example.fr',
        passwordHash: 'h',
        createdAt: startedAt,
      });
      await repository.emailTokens.create({
        token: 'raw-email-token',
        userId: user.id,
        email: user.email,
        kind: 'verify',
        createdAt: startedAt,
        expiresAt: startedAt,
      });

      const { rows } = await database.pool.query('SELECT * FROM email_tokens');

      expect(JSON.stringify(rows)).toContain(sha256('raw-email-token'));
      expect(JSON.stringify(rows)).not.toContain('raw-email-token');
    });
  });

  describe('ping', () => {
    it('resolves when the database answers', async () => {
      await expect(repository.ping()).resolves.toBeUndefined();
    });

    it('rejects when the pool is closed', async () => {
      const closedPool = createPool(TEST_DATABASE_URL ?? '');
      await closedPool.end();

      await expect(new PostgresSnapshotRepository(closedPool).ping()).rejects.toThrow();
    });
  });

  const createRunning = async (): Promise<string> => {
    const project = await repository.projects.findOrCreateByRootUrl({
      ownerId: null,
      rootUrl: 'https://x.test/',
      createdAt: startedAt,
    });
    return (
      await repository.create({ launchedBy: null, projectId: project.id, pagesLimit: 5, startedAt })
    ).id;
  };

  const count = async (table: string): Promise<number> => {
    const { rows } = await database.pool.query<{ n: string }>(`SELECT COUNT(*) AS n FROM ${table}`);
    return Number(rows[0]?.n);
  };

  it('leaves the row count unchanged when a write on a finished snapshot is refused', async () => {
    const id = await createRunning();
    await repository.finish(id, { finishedAt: startedAt, pagesCrawled: 0 });
    await expect(
      repository.addLinks(id, [
        { sourceUrl: 'a', targetUrl: 'b', type: 'external', rel: null, anchor: null },
      ]),
    ).rejects.toThrow(SnapshotImmutable);
    expect(await count('links')).toBe(0);
  });

  it('leaves no partial row when a write fails in the middle of its transaction', async () => {
    const id = await createRunning();
    const valid: Link = {
      sourceUrl: 'a',
      targetUrl: 'b',
      type: 'external',
      rel: null,
      anchor: null,
    };
    const violatingNotNull = { ...valid, type: null as unknown as Link['type'] };
    await expect(repository.addLinks(id, [valid, valid, violatingNotNull])).rejects.toThrow();
    expect(await count('links')).toBe(0);
  });

  it('round-trips an occurrence info with a canonical serialization and a millisecond date', async () => {
    const id = await createRunning();
    const info = { zeta: 1, alpha: { omega: [3, 2], beta: 'b' }, middle: null };
    await repository.addCheckResults(id, [
      {
        checkId: 3,
        severity: 'error',
        theme: 'on-page',
        count: 1,
        examined: 1,
        occurrences: [{ checkId: 3, pageUrl: null, info }],
      },
    ]);

    const details = await repository.getById(id);
    expect(canonical(details?.checkResults[0]?.occurrences[0]?.info)).toBe(canonical(info));
    expect(details?.snapshot.startedAt.toISOString()).toBe('2026-01-01T10:00:00.123Z');
  });

  it('applies every migration once and does nothing on a second run', async () => {
    const empty = await createTestDatabase(TEST_DATABASE_URL ?? '');
    try {
      await migrate(empty.pool);
      const first = await empty.pool.query('SELECT version, applied_at FROM schema_migrations');
      await migrate(empty.pool);
      const second = await empty.pool.query('SELECT version, applied_at FROM schema_migrations');

      expect(first.rows.length).toBeGreaterThan(0);
      expect(second.rows).toEqual(first.rows);
    } finally {
      await empty.dispose();
    }
  });

  it('adds slash_probes to a database at migration 001 without touching existing tables', async () => {
    const legacy = await createTestDatabase(TEST_DATABASE_URL ?? '');
    try {
      const init = readFileSync(
        join(import.meta.dirname, '../../src/infrastructure/postgres/migrations/001_init.sql'),
        'utf8',
      );
      await legacy.pool.query(init);
      await legacy.pool.query(
        'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
      );
      await legacy.pool.query('INSERT INTO schema_migrations (version) VALUES (1)');
      const columnsOf = async (): Promise<unknown[]> => {
        const { rows } = await legacy.pool.query<Record<string, string>>(
          `SELECT table_name, column_name, data_type FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name NOT IN ('slash_probes', 'users', 'sessions', 'email_tokens', 'api_launches', 'workers')
             AND column_name NOT IN ('text_ratio', 'owner_id', 'launched_by', 'attempts', 'queued_at', 'heartbeat_at')
           ORDER BY table_name, column_name`,
        );
        return rows;
      };
      const before = await columnsOf();

      await migrate(legacy.pool);

      expect(await columnsOf()).toEqual(before);
      const versions = await legacy.pool.query('SELECT version FROM schema_migrations ORDER BY 1');
      expect(versions.rows).toEqual([
        { version: 1 },
        { version: 2 },
        { version: 3 },
        { version: 4 },
        { version: 5 },
        { version: 6 },
      ]);
      await expect(legacy.pool.query('SELECT * FROM slash_probes')).resolves.toBeDefined();
    } finally {
      await legacy.dispose();
    }
  });

  it('adds a nullable text_ratio column to a database at migration 002 without touching existing columns', async () => {
    const legacy = await createTestDatabase(TEST_DATABASE_URL ?? '');
    try {
      await legacy.pool.query(readMigration('001_init.sql'));
      await legacy.pool.query(readMigration('002_slash_probes.sql'));
      await legacy.pool.query(
        'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
      );
      await legacy.pool.query('INSERT INTO schema_migrations (version) VALUES (1), (2)');
      const pageColumns = async (): Promise<Record<string, string>[]> => {
        const { rows } = await legacy.pool.query<Record<string, string>>(
          `SELECT column_name, data_type, is_nullable FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'pages' ORDER BY column_name`,
        );
        return rows;
      };
      const before = await pageColumns();

      await migrate(legacy.pool);
      await migrate(legacy.pool);

      const after = await pageColumns();
      expect(after.filter((column) => column['column_name'] !== 'text_ratio')).toEqual(before);
      expect(after.find((column) => column['column_name'] === 'text_ratio')).toEqual({
        column_name: 'text_ratio',
        data_type: 'double precision',
        is_nullable: 'YES',
      });
      const versions = await legacy.pool.query('SELECT version FROM schema_migrations ORDER BY 1');
      expect(versions.rows).toEqual([
        { version: 1 },
        { version: 2 },
        { version: 3 },
        { version: 4 },
        { version: 5 },
        { version: 6 },
      ]);
    } finally {
      await legacy.dispose();
    }
  });
  it('replaces the unique root_url constraint by two partial indexes without touching rows', async () => {
    const legacy = await createTestDatabase(TEST_DATABASE_URL ?? '');
    try {
      for (const file of ['001_init.sql', '002_slash_probes.sql', '003_page_text_ratio.sql']) {
        await legacy.pool.query(readMigration(file));
      }
      await legacy.pool.query(
        'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
      );
      await legacy.pool.query('INSERT INTO schema_migrations (version) VALUES (1), (2), (3)');
      await legacy.pool.query(
        `INSERT INTO projects (id, root_url, created_at) VALUES ('p1', 'https://a.test/', now()), ('p2', 'https://b.test/', now())`,
      );
      const rowsBefore = (await legacy.pool.query<ProjectRow>('SELECT * FROM projects ORDER BY id'))
        .rows;

      await migrate(legacy.pool);

      const constraints = await legacy.pool.query(
        `SELECT conname FROM pg_constraint WHERE conname = 'projects_root_url_key'`,
      );
      const indexes = await legacy.pool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname = current_schema() AND tablename = 'projects' AND indexdef LIKE '%UNIQUE%WHERE%'
         ORDER BY indexname`,
      );
      const rowsAfter = (await legacy.pool.query<ProjectRow>('SELECT * FROM projects ORDER BY id'))
        .rows;
      expect(constraints.rows).toEqual([]);
      expect(indexes.rows.map(({ indexdef }) => indexdef.replace(/^.* WHERE /, ''))).toEqual([
        '(owner_id IS NOT NULL)',
        '(owner_id IS NULL)',
      ]);
      expect(rowsAfter.map(({ owner_id: ownerId }) => ownerId)).toEqual([null, null]);
      expect(rowsAfter.map(({ id, root_url: rootUrl }) => [id, rootUrl])).toEqual(
        rowsBefore.map(({ id, root_url: rootUrl }) => [id, rootUrl]),
      );
    } finally {
      await legacy.dispose();
    }
  });
  describe('migration 006 on a database at migration 005', () => {
    const LEGACY_INSERT = `INSERT INTO snapshots (id, project_id, launched_by, status, started_at, pages_crawled, pages_limit)
       VALUES ($1, 'p1', NULL, 'running', now(), 0, 10)`;

    const migrateFrom005 = async (legacy: TestDatabase): Promise<void> => {
      for (const file of [
        '001_init.sql',
        '002_slash_probes.sql',
        '003_page_text_ratio.sql',
        '004_accounts.sql',
        '005_api_launches.sql',
      ]) {
        await legacy.pool.query(readMigration(file));
      }
      await legacy.pool.query(
        'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
      );
      await legacy.pool.query(
        'INSERT INTO schema_migrations (version) VALUES (1), (2), (3), (4), (5)',
      );
      await legacy.pool.query(
        `INSERT INTO projects (id, root_url, created_at) VALUES ('p1', 'https://a.test/', now());
         INSERT INTO snapshots (id, project_id, status, started_at, pages_limit)
         VALUES ('s1', 'p1', 'finished', now(), 10), ('s2', 'p1', 'running', now(), 10)`,
      );
      await migrate(legacy.pool);
    };

    it('keeps existing rows and creates the workers table', async () => {
      const legacy = await createTestDatabase(TEST_DATABASE_URL ?? '');
      try {
        await migrateFrom005(legacy);

        const snapshots = await legacy.pool.query(
          'SELECT id, status, attempts, queued_at, heartbeat_at FROM snapshots ORDER BY id',
        );
        const workers = await legacy.pool.query('SELECT id, heartbeat_at FROM workers');
        expect(snapshots.rows).toEqual([
          { id: 's1', status: 'finished', attempts: 0, queued_at: null, heartbeat_at: null },
          { id: 's2', status: 'running', attempts: 0, queued_at: null, heartbeat_at: null },
        ]);
        expect(workers.rows).toEqual([]);
      } finally {
        await legacy.dispose();
      }
    });

    it('accepts the previous version INSERT and queued, and refuses any other status', async () => {
      const legacy = await createTestDatabase(TEST_DATABASE_URL ?? '');
      try {
        await migrateFrom005(legacy);

        await legacy.pool.query(LEGACY_INSERT, ['legacy']);
        await legacy.pool.query(
          `INSERT INTO snapshots (id, project_id, status, started_at, pages_limit)
           VALUES ('q', 'p1', 'queued', now(), 10)`,
        );
        const legacyRow = await legacy.pool.query(
          "SELECT attempts FROM snapshots WHERE id = 'legacy'",
        );
        expect(legacyRow.rows).toEqual([{ attempts: 0 }]);
        await expect(
          legacy.pool.query(
            `INSERT INTO snapshots (id, project_id, status, started_at, pages_limit)
             VALUES ('x', 'p1', 'paused', now(), 10)`,
          ),
        ).rejects.toThrow(/check/);
      } finally {
        await legacy.dispose();
      }
    });
  });
  describe('account erasure', () => {
    const ALL_TABLES = [
      'users',
      'sessions',
      'email_tokens',
      'projects',
      'snapshots',
      'pages',
      'links',
      'site_files',
      'host_probes',
      'slash_probes',
      'check_results',
      'issue_occurrences',
    ];

    const rowCounts = async (): Promise<Record<string, number>> =>
      Object.fromEntries(
        await Promise.all(ALL_TABLES.map(async (table) => [table, await count(table)] as const)),
      );

    const seedOthers = async (): Promise<void> => {
      await seedAccount(storage(), { email: 'v@example.fr' });
      await seedProject(storage(), { ownerId: null, rootUrl: 'https://showcase.test/' });
    };

    it('leaves exactly the rows of the other accounts and of the showcase', async () => {
      await seedOthers();
      const baseline = await rowCounts();
      const u = await seedAccount(storage(), { email: 'u@example.fr' });

      await repository.eraser.eraseAccount(u.userId);

      expect(await rowCounts()).toEqual(baseline);
    });

    it('rolls back every deletion when the erasure fails midway', async () => {
      await seedOthers();
      const u = await seedAccount(storage(), { email: 'u@example.fr' });
      const before = await rowCounts();
      await database.pool.query(
        `CREATE FUNCTION fail_user_erasure() RETURNS trigger LANGUAGE plpgsql AS
         $$ BEGIN RAISE EXCEPTION 'boom'; END $$`,
      );
      await database.pool.query(
        'CREATE TRIGGER fail_user_erasure BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION fail_user_erasure()',
      );
      try {
        await expect(repository.eraser.eraseAccount(u.userId)).rejects.toThrow('boom');
        expect(await rowCounts()).toEqual(before);
      } finally {
        await database.pool.query('DROP TRIGGER fail_user_erasure ON users');
        await database.pool.query('DROP FUNCTION fail_user_erasure()');
      }
    });
  });
});
