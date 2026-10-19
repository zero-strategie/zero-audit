import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Link } from '../../src/domain/crawl.js';
import { SnapshotImmutable } from '../../src/domain/errors.js';
import { migrate } from '../../src/infrastructure/postgres/migrate.js';
import { PostgresSnapshotRepository } from '../../src/infrastructure/postgres/postgres-snapshot-repository.js';
import { describeProjectRepositoryContract } from '../support/project-repository-contract.js';
import {
  createTestDatabase,
  TEST_DATABASE_URL,
  type TestDatabase,
} from '../support/postgres-test-database.js';
import { describeSnapshotRepositoryContract } from '../support/snapshot-repository-contract.js';

const startedAt = new Date('2026-01-01T10:00:00.123Z');
const CONTENT_TABLES =
  'pages, links, site_files, host_probes, check_results, issue_occurrences, snapshots, projects';

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
  }));
  describeProjectRepositoryContract(() => repository.projects);

  const createRunning = async (): Promise<string> => {
    const project = await repository.projects.findOrCreateByRootUrl({
      rootUrl: 'https://x.test/',
      createdAt: startedAt,
    });
    return (await repository.create({ projectId: project.id, pagesLimit: 5, startedAt })).id;
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
});
