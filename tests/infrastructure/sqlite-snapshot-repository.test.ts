import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SnapshotImmutable } from '../../src/domain/errors.js';
import { UNKNOWN_PROJECT_ROOT_URL } from '../../src/domain/project.js';
import { SqliteSnapshotRepository } from '../../src/infrastructure/sqlite/sqlite-snapshot-repository.js';
import { describeProjectRepositoryContract } from '../support/project-repository-contract.js';
import { describeSnapshotRepositoryContract } from '../support/snapshot-repository-contract.js';

const openInMemory = (): SqliteSnapshotRepository => SqliteSnapshotRepository.open(':memory:');

describeSnapshotRepositoryContract(() => {
  const repository = openInMemory();
  return { snapshots: repository, projects: repository.projects };
});
describeProjectRepositoryContract(() => openInMemory().projects);

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
    expect(schemaVersion(path)).toBe(2);
  });

  it('does not replay migrations and keeps existing snapshots readable', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'audit.db');
    const first = SqliteSnapshotRepository.open(path);
    const project = await first.projects.findOrCreateByRootUrl({
      rootUrl: 'https://x.test/',
      createdAt: startedAt,
    });
    const { id } = await first.create({ projectId: project.id, pagesLimit: 5, startedAt });
    first.close();

    const second = SqliteSnapshotRepository.open(path);
    const details = await second.getById(id);
    second.close();

    expect(details?.snapshot.pagesLimit).toBe(5);
    expect(schemaVersion(path)).toBe(2);
  });

  it('leaves the row count unchanged when a write on a finished snapshot is refused', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'audit.db');
    const repo = SqliteSnapshotRepository.open(path);
    const project = await repo.projects.findOrCreateByRootUrl({
      rootUrl: 'https://x.test/',
      createdAt: startedAt,
    });
    const { id } = await repo.create({ projectId: project.id, pagesLimit: 5, startedAt });
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
    db.prepare(
      "INSERT INTO check_results (snapshot_id, check_id, severity, theme, count, examined) VALUES ('with-pages', 3, 'error', 'content', 1, 2)",
    ).run();
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
      3, 1, 1,
    ]);
  });

  it('does not replay the migration nor duplicate projects when reopened', () => {
    const path = buildMilestone1Database();
    SqliteSnapshotRepository.open(path).close();
    SqliteSnapshotRepository.open(path).close();

    expect(schemaVersion(path)).toBe(2);
    expect(count(path, 'projects')).toBe(2);
  });

  it('exposes the adopted snapshots through the repositories', async () => {
    const path = buildMilestone1Database();
    const repo = SqliteSnapshotRepository.open(path);
    const [project] = (await repo.projects.list()).filter(
      ({ rootUrl }) => rootUrl === 'https://x.test/',
    );
    const listed = await repo.listByProject(project?.id ?? '');
    repo.close();

    expect(listed.map(({ id }) => id)).toEqual(['with-pages-again', 'with-pages']);
  });
});
