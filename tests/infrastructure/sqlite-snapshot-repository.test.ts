import Database from 'better-sqlite3';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SnapshotImmutable } from '../../src/domain/errors.js';
import { SqliteSnapshotRepository } from '../../src/infrastructure/sqlite/sqlite-snapshot-repository.js';
import { describeSnapshotRepositoryContract } from '../support/snapshot-repository-contract.js';

describeSnapshotRepositoryContract(() => SqliteSnapshotRepository.open(':memory:'));

const startedAt = new Date('2026-01-01T10:00:00.000Z');

const schemaVersion = (path: string): number => {
  const db = new Database(path, { readonly: true });
  const rows = db.prepare('SELECT version FROM schema_version').all() as { version: number }[];
  db.close();
  return rows.length === 1 && rows[0] ? rows[0].version : -1;
};

describe('SqliteSnapshotRepository file handling', () => {
  it('creates missing parent folders and applies the initial migration', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'nested', 'deeper', 'audit.db');
    SqliteSnapshotRepository.open(path).close();
    expect(existsSync(path)).toBe(true);
    expect(schemaVersion(path)).toBe(1);
  });

  it('does not replay migrations and keeps existing snapshots readable', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'audit.db');
    const first = SqliteSnapshotRepository.open(path);
    const { id } = await first.create({ pagesLimit: 5, startedAt });
    first.close();

    const second = SqliteSnapshotRepository.open(path);
    const details = await second.getById(id);
    second.close();

    expect(details?.snapshot.pagesLimit).toBe(5);
    expect(schemaVersion(path)).toBe(1);
  });

  it('leaves the row count unchanged when a write on a finished snapshot is refused', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'zero-audit-')), 'audit.db');
    const repo = SqliteSnapshotRepository.open(path);
    const { id } = await repo.create({ pagesLimit: 5, startedAt });
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
