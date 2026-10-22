import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SnapshotImmutable } from '../../src/domain/errors.js';
import { UNKNOWN_PROJECT_ROOT_URL } from '../../src/domain/project.js';
import { openDatabase } from '../../src/infrastructure/sqlite/open-database.js';
import { SqliteSnapshotRepository } from '../../src/infrastructure/sqlite/sqlite-snapshot-repository.js';
import { SqliteAccountEraser } from '../../src/infrastructure/sqlite/sqlite-account-eraser.js';
import { SqliteEmailTokenRepository } from '../../src/infrastructure/sqlite/sqlite-email-token-repository.js';
import { SqliteSessionRepository } from '../../src/infrastructure/sqlite/sqlite-session-repository.js';
import { SqliteUserRepository } from '../../src/infrastructure/sqlite/sqlite-user-repository.js';
import { sqliteLegacyAccounts } from '../support/legacy-accounts.js';
import { describeProjectRepositoryContract } from '../support/project-repository-contract.js';
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

const openInMemory = (): SqliteSnapshotRepository => SqliteSnapshotRepository.open(':memory:');

const accountsOf = (repository: SqliteSnapshotRepository) => ({
  users: new SqliteUserRepository(repository.db),
  sessions: new SqliteSessionRepository(repository.db),
  emailTokens: new SqliteEmailTokenRepository(repository.db),
  eraser: new SqliteAccountEraser(repository.db),
});

describeSnapshotRepositoryContract(() => {
  const repository = openInMemory();
  return {
    snapshots: repository,
    projects: repository.projects,
    accounts: sqliteLegacyAccounts(repository.db),
  };
});
describe('SqliteSnapshotRepository busy timeout', () => {
  it('waits for a competing writer instead of failing at once', () => {
    const opened = openDatabase(':memory:');
    const timeout = opened.pragma('busy_timeout', { simple: true });
    opened.close();

    expect(timeout).toBeGreaterThan(0);
  });
});
describeProjectRepositoryContract(() => {
  const repository = openInMemory();
  return { projects: repository.projects, users: accountsOf(repository).users };
});
describeUserRepositoryContract(() => accountsOf(openInMemory()).users);
describeSessionRepositoryContract(() => {
  const repository = openInMemory();
  return { sessions: accountsOf(repository).sessions, users: accountsOf(repository).users };
});
describeEmailTokenRepositoryContract(() => {
  const repository = openInMemory();
  return { emailTokens: accountsOf(repository).emailTokens, users: accountsOf(repository).users };
});
const storageOf = (repository: SqliteSnapshotRepository): AccountStorage => ({
  users: accountsOf(repository).users,
  projects: repository.projects,
  snapshots: repository,
  sessions: accountsOf(repository).sessions,
  emailTokens: accountsOf(repository).emailTokens,
  eraser: accountsOf(repository).eraser,
});
describeAccountEraserContract(() => storageOf(openInMemory()));

describe('SqliteSnapshotRepository ping', () => {
  it('resolves while the database is open', async () => {
    await expect(openInMemory().ping()).resolves.toBeUndefined();
  });

  it('rejects once the database is closed', async () => {
    const repository = openInMemory();
    repository.close();

    await expect(repository.ping()).rejects.toThrow();
  });
});

const startedAt = new Date('2026-01-01T10:00:00.000Z');

const schemaVersion = (path: string): number => {
  const db = new Database(path, { readonly: true });
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as {
    version: number | null;
  };
  db.close();
  return row.version ?? -1;
};

describe('SqliteSnapshotRepository file handling', () => {
  it('creates missing parent folders and applies every migration', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'nested', 'deeper', 'audit.db');
    SqliteSnapshotRepository.open(path).close();
    expect(existsSync(path)).toBe(true);
    expect(schemaVersion(path)).toBe(11);
  });

  it('does not replay migrations and keeps existing snapshots readable', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'audit.db');
    const first = SqliteSnapshotRepository.open(path);
    const project = await first.projects.findOrCreateByRootUrl({
      ownerId: null,
      rootUrl: 'https://x.test/',
      createdAt: startedAt,
    });
    const { id } = await first.create({
      launchedBy: null,
      projectId: project.id,
      pagesLimit: 5,
      startedAt,
    });
    first.close();

    const second = SqliteSnapshotRepository.open(path);
    const details = await second.getById(id);
    second.close();

    expect(details?.snapshot.pagesLimit).toBe(5);
    expect(schemaVersion(path)).toBe(11);
  });

  it('leaves the row count unchanged when a write on a finished snapshot is refused', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'audit.db');
    const repo = SqliteSnapshotRepository.open(path);
    const project = await repo.projects.findOrCreateByRootUrl({
      ownerId: null,
      rootUrl: 'https://x.test/',
      createdAt: startedAt,
    });
    const { id } = await repo.create({
      launchedBy: null,
      projectId: project.id,
      pagesLimit: 5,
      startedAt,
    });
    await repo.finish(id, { finishedAt: startedAt, pagesCrawled: 0 });
    await expect(
      repo.addLinks(id, [
        { sourceUrl: 'a', targetUrl: 'b', type: 'external', rel: null, anchor: null },
      ]),
    ).rejects.toThrow(SnapshotImmutable);
    repo.close();

    const db = new Database(path, { readonly: true });
    const count = db.prepare('SELECT COUNT(*) AS n FROM links').get() as { n: number };
    db.close();
    expect(count.n).toBe(0);
  });
});

describe('migration 002 on a milestone 1 database', () => {
  const MIGRATION_001 = join(
    import.meta.dirname,
    '../../src/infrastructure/sqlite/migrations/001_init.sql',
  );

  const buildMilestone1Database = (): string => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'audit.db');
    const db = new Database(path);
    db.exec(readFileSync(MIGRATION_001, 'utf8'));
    db.exec(
      'CREATE TABLE schema_version (version INTEGER PRIMARY KEY); INSERT INTO schema_version VALUES (1)',
    );
    const insertSnapshot = db.prepare(
      "INSERT INTO snapshots (id, status, started_at, pages_limit) VALUES (?, 'finished', ?, 10)",
    );
    insertSnapshot.run('with-pages', '2025-12-01T10:00:00.000Z');
    insertSnapshot.run('with-pages-again', '2025-12-02T10:00:00.000Z');
    insertSnapshot.run('empty', '2025-12-03T10:00:00.000Z');
    const insertPage = db.prepare(
      `INSERT INTO pages (snapshot_id, url, depth, redirect_chain, headers, response_time_ms, is_html, h1)
       VALUES (?, ?, ?, '[]', '{}', 5, 1, '[]')`,
    );
    insertPage.run('with-pages', 'https://x.test/a', 1);
    insertPage.run('with-pages', 'https://x.test/', 0);
    insertPage.run('with-pages-again', 'https://x.test/', 0);
    db.prepare(
      "INSERT INTO links (snapshot_id, source_url, target_url, type) VALUES ('with-pages', 'https://x.test/', 'https://x.test/a', 'internal')",
    ).run();
    const insertResult = db.prepare(
      "INSERT INTO check_results (snapshot_id, check_id, severity, theme, count, examined) VALUES ('with-pages', ?, 'error', ?, 1, 2)",
    );
    insertResult.run(3, 'markup');
    insertResult.run(117, 'content');
    insertResult.run(1, 'status');
    insertResult.run(8, 'links');
    db.close();
    return path;
  };

  const projectUrlOf = (path: string, snapshotId: string): string | undefined => {
    const db = new Database(path, { readonly: true });
    const row = db
      .prepare(
        'SELECT p.root_url AS root_url FROM snapshots s JOIN projects p ON p.id = s.project_id WHERE s.id = ?',
      )
      .get(snapshotId) as { root_url: string } | undefined;
    db.close();
    return row?.root_url;
  };

  const count = (path: string, table: string): number => {
    const db = new Database(path, { readonly: true });
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    db.close();
    return row.n;
  };

  it('attaches snapshots to the project of their depth 0 page, or to the unknown project', () => {
    const path = buildMilestone1Database();
    SqliteSnapshotRepository.open(path).close();

    expect(projectUrlOf(path, 'with-pages')).toBe('https://x.test/');
    expect(projectUrlOf(path, 'with-pages-again')).toBe('https://x.test/');
    expect(projectUrlOf(path, 'empty')).toBe(UNKNOWN_PROJECT_ROOT_URL);
    expect(count(path, 'projects')).toBe(2);
  });

  it('keeps pages, links and check results untouched', () => {
    const path = buildMilestone1Database();
    SqliteSnapshotRepository.open(path).close();

    expect([count(path, 'pages'), count(path, 'links'), count(path, 'check_results')]).toEqual([
      3, 1, 4,
    ]);
  });

  it('does not replay the migration nor duplicate projects when reopened', () => {
    const path = buildMilestone1Database();
    SqliteSnapshotRepository.open(path).close();
    SqliteSnapshotRepository.open(path).close();

    expect(schemaVersion(path)).toBe(11);
    expect(count(path, 'projects')).toBe(2);
  });

  it('exposes the adopted snapshots through the repositories', async () => {
    const path = buildMilestone1Database();
    const repo = SqliteSnapshotRepository.open(path);
    const [project] = (await repo.projects.list(null)).filter(
      ({ rootUrl }) => rootUrl === 'https://x.test/',
    );
    const listed = await repo.listByProject(project?.id ?? '');
    repo.close();

    expect(listed.map(({ id }) => id)).toEqual(['with-pages-again', 'with-pages']);
  });

  it('exposes milestone 1 themes as milestone 2 themes without rewriting the rows', async () => {
    const path = buildMilestone1Database();
    const repo = SqliteSnapshotRepository.open(path);
    const details = await repo.getById('with-pages');
    repo.close();

    expect(details?.checkResults.map(({ checkId, theme }) => [checkId, theme])).toEqual([
      [3, 'on-page'],
      [117, 'on-page'],
      [1, 'crawlability'],
      [8, 'linking'],
    ]);
    const db = new Database(path, { readonly: true });
    const stored = db.prepare('SELECT theme FROM check_results ORDER BY id').all();
    db.close();
    expect(stored).toEqual([
      { theme: 'markup' },
      { theme: 'content' },
      { theme: 'status' },
      { theme: 'links' },
    ]);
  });

  it('reads a milestone 1 snapshot with an empty list of site files', async () => {
    const repo = SqliteSnapshotRepository.open(buildMilestone1Database());
    const details = await repo.getById('with-pages');
    repo.close();

    expect(details?.siteFiles).toEqual([]);
  });
});

describe('migration 008 on a database at migration 007', () => {
  const MIGRATIONS_DIR = join(import.meta.dirname, '../../src/infrastructure/sqlite/migrations');

  const buildDatabaseAt007 = (): string => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'audit.db');
    const db = new Database(path);
    db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY)');
    for (const [index, file] of readdirSync(MIGRATIONS_DIR).sort().entries()) {
      if (index >= 7) break;
      db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(index + 1);
    }
    db.exec(
      `INSERT INTO snapshots (id, status, started_at, pages_limit) VALUES ('old', 'finished', '2025-12-01T10:00:00.000Z', 10);
       INSERT INTO pages (snapshot_id, url, depth, redirect_chain, headers, response_time_ms, is_html, h1)
       VALUES ('old', 'https://x.test/', 0, '[]', '{}', 5, 1, '[]')`,
    );
    db.close();
    return path;
  };

  const pageColumns = (path: string): unknown[] => {
    const db = new Database(path, { readonly: true });
    const columns = db.prepare('PRAGMA table_info(pages)').all();
    db.close();
    return columns;
  };

  it('adds a nullable text_ratio column, keeps existing columns and is not replayed', async () => {
    const path = buildDatabaseAt007();
    const before = pageColumns(path);

    SqliteSnapshotRepository.open(path).close();
    const after = pageColumns(path);
    const reopened = SqliteSnapshotRepository.open(path);
    const details = await reopened.getById('old');
    reopened.close();

    expect(after.slice(0, before.length)).toEqual(before);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toMatchObject({ name: 'text_ratio', type: 'REAL', notnull: 0 });
    expect(schemaVersion(path)).toBe(11);
    expect(details?.pages[0]?.textRatio).toBeNull();
  });
});

describe('migration 009 on a database at migration 008', () => {
  const MIGRATIONS_DIR = join(import.meta.dirname, '../../src/infrastructure/sqlite/migrations');
  const LAST_VERSION_BEFORE_ACCOUNTS = 8;

  const buildPopulatedDatabaseAt008 = (): string => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'audit.db');
    const db = new Database(path);
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY)');
    for (const [index, file] of readdirSync(MIGRATIONS_DIR).sort().entries()) {
      if (index >= LAST_VERSION_BEFORE_ACCOUNTS) break;
      db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(index + 1);
    }
    db.exec(
      `INSERT INTO projects (id, root_url, created_at) VALUES
         ('project-a', 'https://a.test/', '2025-12-01T10:00:00.000Z'),
         ('project-b', 'https://b.test/', '2025-12-02T10:00:00.000Z');
       INSERT INTO snapshots (id, project_id, status, started_at, pages_limit) VALUES
         ('snapshot-a1', 'project-a', 'finished', '2025-12-01T10:00:00.000Z', 10),
         ('snapshot-a2', 'project-a', 'failed', '2025-12-03T10:00:00.000Z', 10),
         ('snapshot-b1', 'project-b', 'finished', '2025-12-02T10:00:00.000Z', 10);
       INSERT INTO pages (snapshot_id, url, depth, redirect_chain, headers, response_time_ms, is_html, h1)
       VALUES ('snapshot-a1', 'https://a.test/', 0, '[]', '{}', 5, 1, '[]')`,
    );
    db.close();
    return path;
  };

  const inspect = <T>(path: string, work: (db: Database.Database) => T): T => {
    const db = new Database(path);
    db.pragma('foreign_keys = ON');
    try {
      return work(db);
    } finally {
      db.close();
    }
  };

  it('keeps project ids and snapshot links, with no owner and no foreign key violation', () => {
    const path = buildPopulatedDatabaseAt008();
    SqliteSnapshotRepository.open(path).close();

    inspect(path, (db) => {
      expect(db.prepare('SELECT id, root_url, owner_id FROM projects ORDER BY id').all()).toEqual([
        { id: 'project-a', root_url: 'https://a.test/', owner_id: null },
        { id: 'project-b', root_url: 'https://b.test/', owner_id: null },
      ]);
      expect(db.prepare('SELECT id, project_id FROM snapshots ORDER BY id').all()).toEqual([
        { id: 'snapshot-a1', project_id: 'project-a' },
        { id: 'snapshot-a2', project_id: 'project-a' },
        { id: 'snapshot-b1', project_id: 'project-b' },
      ]);
      expect(db.prepare('SELECT COUNT(*) AS n FROM pages').get()).toEqual({ n: 1 });
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(schemaVersion(path)).toBe(11);
    });
  });

  it('lets two projects with the same URL coexist under different owners only', () => {
    const path = buildPopulatedDatabaseAt008();
    SqliteSnapshotRepository.open(path).close();

    inspect(path, (db) => {
      db.exec(
        `INSERT INTO users (id, email, password_hash, created_at) VALUES
           ('u', 'u@example.fr', 'h', '2026-01-01T00:00:00.000Z'),
           ('v', 'v@example.fr', 'h', '2026-01-01T00:00:00.000Z')`,
      );
      const insert = db.prepare(
        "INSERT INTO projects (id, root_url, owner_id, created_at) VALUES (?, 'https://a.test/', ?, '2026-01-01T00:00:00.000Z')",
      );
      insert.run('a-for-u', 'u');
      insert.run('a-for-v', 'v');
      expect(() => insert.run('a-for-u-again', 'u')).toThrow(/UNIQUE/);
      expect(() => insert.run('a-public-again', null)).toThrow(/UNIQUE/);
    });
  });
});

describe('migration 011 on a database at migration 010', () => {
  const MIGRATIONS_DIR = join(import.meta.dirname, '../../src/infrastructure/sqlite/migrations');
  const LAST_VERSION_BEFORE_QUEUE = 10;
  const LEGACY_INSERT =
    "INSERT INTO snapshots (id, project_id, launched_by, status, started_at, pages_crawled, pages_limit) VALUES (?, 'project-a', NULL, 'running', '2026-01-01T00:00:00.000Z', 0, 10)";

  const buildPopulatedDatabaseAt010 = (): string => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'audit.db');
    const db = new Database(path);
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY)');
    for (const [index, file] of readdirSync(MIGRATIONS_DIR).sort().entries()) {
      if (index >= LAST_VERSION_BEFORE_QUEUE) break;
      db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(index + 1);
    }
    db.exec(
      `INSERT INTO users (id, email, password_hash, created_at) VALUES ('u', 'u@example.fr', 'h', '2025-12-01T00:00:00.000Z');
       INSERT INTO projects (id, root_url, owner_id, created_at) VALUES
         ('project-a', 'https://a.test/', 'u', '2025-12-01T10:00:00.000Z');
       INSERT INTO snapshots (id, project_id, launched_by, status, started_at, finished_at, pages_crawled, pages_limit) VALUES
         ('snapshot-a1', 'project-a', 'u', 'finished', '2025-12-01T10:00:00.000Z', '2025-12-01T10:05:00.000Z', 3, 10),
         ('snapshot-a2', 'project-a', NULL, 'running', '2025-12-03T10:00:00.000Z', NULL, 0, 10);
       INSERT INTO pages (snapshot_id, url, depth, redirect_chain, headers, response_time_ms, is_html, h1)
       VALUES ('snapshot-a1', 'https://a.test/', 0, '[]', '{}', 5, 1, '[]');
       INSERT INTO links (snapshot_id, source_url, target_url, type) VALUES ('snapshot-a1', 'https://a.test/', 'https://a.test/b', 'internal');
       INSERT INTO api_launches (id, email_hash, launched_at) VALUES ('l1', 'hash', '2025-12-01T10:00:00.000Z')`,
    );
    db.close();
    return path;
  };

  const inspect = <T>(path: string, work: (db: Database.Database) => T): T => {
    const db = new Database(path);
    db.pragma('foreign_keys = ON');
    try {
      return work(db);
    } finally {
      db.close();
    }
  };

  it('keeps every row and id, keeps child foreign keys valid and recreates the indexes', () => {
    const path = buildPopulatedDatabaseAt010();

    SqliteSnapshotRepository.open(path).close();

    inspect(path, (db) => {
      expect(
        db
          .prepare(
            'SELECT id, project_id, launched_by, status, pages_crawled FROM snapshots ORDER BY id',
          )
          .all(),
      ).toEqual([
        {
          id: 'snapshot-a1',
          project_id: 'project-a',
          launched_by: 'u',
          status: 'finished',
          pages_crawled: 3,
        },
        {
          id: 'snapshot-a2',
          project_id: 'project-a',
          launched_by: null,
          status: 'running',
          pages_crawled: 0,
        },
      ]);
      expect(db.prepare('SELECT COUNT(*) AS n FROM pages').get()).toEqual({ n: 1 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM links').get()).toEqual({ n: 1 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM api_launches').get()).toEqual({ n: 1 });
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'snapshots' AND name LIKE 'idx_%' ORDER BY name",
          )
          .all(),
      ).toEqual([
        { name: 'idx_snapshots_project_started' },
        { name: 'idx_snapshots_status_queued' },
      ]);
      expect(db.prepare('SELECT COUNT(*) AS n FROM workers').get()).toEqual({ n: 0 });
      expect(schemaVersion(path)).toBe(11);
    });
  });

  it('defaults the new columns when the previous version inserts a snapshot', () => {
    const path = buildPopulatedDatabaseAt010();
    SqliteSnapshotRepository.open(path).close();

    inspect(path, (db) => {
      db.prepare(LEGACY_INSERT).run('legacy');

      expect(
        db
          .prepare("SELECT attempts, queued_at, heartbeat_at FROM snapshots WHERE id = 'legacy'")
          .get(),
      ).toEqual({ attempts: 0, queued_at: null, heartbeat_at: null });
    });
  });

  it('accepts queued and refuses any other status', () => {
    const path = buildPopulatedDatabaseAt010();
    SqliteSnapshotRepository.open(path).close();

    inspect(path, (db) => {
      const insert = db.prepare(
        "INSERT INTO snapshots (id, project_id, status, started_at, pages_limit) VALUES (?, 'project-a', ?, '2026-01-01T00:00:00.000Z', 10)",
      );
      expect(() => insert.run('q', 'queued')).not.toThrow();
      expect(() => insert.run('x', 'paused')).toThrow(/CHECK/);
    });
  });
});

describe('SqliteSnapshotRepository secrets at rest', () => {
  const openOnFile = (): { path: string; repository: SqliteSnapshotRepository } => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'audit.db');
    return { path, repository: SqliteSnapshotRepository.open(path) };
  };

  const dump = (path: string, table: string): string => {
    const db = new Database(path, { readonly: true });
    const rows = JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all());
    db.close();
    return rows;
  };

  it('stores the SHA-256 of a session identifier, never the identifier', async () => {
    const { path, repository } = openOnFile();
    const user = await accountsOf(repository).users.create({
      email: 'u@example.fr',
      passwordHash: 'h',
      createdAt: startedAt,
    });
    await accountsOf(repository).sessions.create({
      id: 'raw-session-id',
      userId: user.id,
      createdAt: startedAt,
      expiresAt: startedAt,
    });
    repository.close();

    const stored = dump(path, 'sessions');
    expect(stored).toContain(createHash('sha256').update('raw-session-id').digest('hex'));
    expect(stored).not.toContain('raw-session-id');
  });

  it('stores the SHA-256 of an e-mail token, never the token', async () => {
    const { path, repository } = openOnFile();
    const user = await accountsOf(repository).users.create({
      email: 'u@example.fr',
      passwordHash: 'h',
      createdAt: startedAt,
    });
    await accountsOf(repository).emailTokens.create({
      token: 'raw-email-token',
      userId: user.id,
      email: user.email,
      kind: 'verify',
      createdAt: startedAt,
      expiresAt: startedAt,
    });
    repository.close();

    const stored = dump(path, 'email_tokens');
    expect(stored).toContain(createHash('sha256').update('raw-email-token').digest('hex'));
    expect(stored).not.toContain('raw-email-token');
  });
});

describe('SqliteSnapshotRepository launch journal', () => {
  it('journals a launch under the SHA-256 of the e-mail of a user inserted with plain SQL', async () => {
    const repository = openInMemory();
    const userId = await sqliteLegacyAccounts(repository.db).insertUser('journal@example.test');
    const project = await repository.projects.findOrCreateByRootUrl({
      rootUrl: 'https://example.test/',
      ownerId: null,
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
    });

    await repository.enqueue(
      {
        projectId: project.id,
        launchedBy: userId,
        pagesLimit: 10,
        requestedAt: new Date('2026-01-01T10:00:00.000Z'),
      },
      () => Promise.resolve(),
    );

    const rows = repository.db.prepare('SELECT email_hash FROM api_launches').all();
    expect(rows).toEqual([
      { email_hash: createHash('sha256').update('journal@example.test').digest('hex') },
    ]);
  });
});

describe('SqliteAccountEraser', () => {
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

  const openOnFile = (): { path: string; repository: SqliteSnapshotRepository } => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'audit.db');
    return { path, repository: SqliteSnapshotRepository.open(path) };
  };

  const rowCounts = (path: string): Record<string, number> => {
    const db = new Database(path, { readonly: true });
    const counts = Object.fromEntries(
      ALL_TABLES.map((table) => [
        table,
        (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
      ]),
    );
    db.close();
    return counts;
  };

  const seedOthers = async (repository: SqliteSnapshotRepository): Promise<void> => {
    await seedAccount(storageOf(repository), { email: 'v@example.fr' });
    await seedProject(storageOf(repository), { ownerId: null, rootUrl: 'https://showcase.test/' });
  };

  it('leaves exactly the rows of the other accounts and of the showcase', async () => {
    const { path, repository } = openOnFile();
    await seedOthers(repository);
    const baseline = rowCounts(path);
    const u = await seedAccount(storageOf(repository), { email: 'u@example.fr' });

    await accountsOf(repository).eraser.eraseAccount(u.userId);

    expect(rowCounts(path)).toEqual(baseline);
    repository.close();
  });

  it('rolls back every deletion when the erasure fails midway', async () => {
    const { path, repository } = openOnFile();
    await seedOthers(repository);
    const u = await seedAccount(storageOf(repository), { email: 'u@example.fr' });
    const before = rowCounts(path);
    const saboteur = new Database(path);
    saboteur.exec(
      "CREATE TRIGGER fail_user_erasure BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'boom'); END",
    );
    saboteur.close();

    await expect(accountsOf(repository).eraser.eraseAccount(u.userId)).rejects.toThrow('boom');

    expect(rowCounts(path)).toEqual(before);
    repository.close();
  });
});
