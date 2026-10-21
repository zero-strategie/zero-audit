import { describe, expect, it } from 'vitest';
import { ListIssues } from '../../src/application/list-issues.js';
import { ListOccurrences } from '../../src/application/list-occurrences.js';
import type { Check, CheckResult } from '../../src/domain/check.js';
import { SnapshotNotFound, UnknownCheck } from '../../src/domain/errors.js';
import { ANONYMOUS_READER } from '../../src/domain/reader.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';

const checks: Check[] = [
  { id: 15, severity: 'warning', theme: 'on-page', scope: 'site', label: 'Quinze', run: () => [] },
  { id: 2, severity: 'error', theme: 'crawlability', scope: 'site', label: 'Deux', run: () => [] },
  { id: 9, severity: 'notice', theme: 'linking', scope: 'site', label: 'Neuf', run: () => [] },
];

const result = (checkId: number, urls: string[]): CheckResult => ({
  checkId,
  severity: checkId === 15 ? 'warning' : 'error',
  theme: 'on-page',
  count: urls.length,
  examined: 4,
  occurrences: urls.map((pageUrl) => ({ checkId, pageUrl, info: {} })),
});

const minutes = (n: number): Date => new Date(Date.UTC(2026, 0, 1, 10, n));

const setup = () => {
  const repository = new InMemorySnapshotRepository();
  const projects = new InMemoryProjectRepository();
  const record = async (minute: number, results: CheckResult[]): Promise<string> => {
    const project = await projects.findOrCreateByRootUrl({
      rootUrl: 'https://e.com/',
      ownerId: null,
      createdAt: minutes(0),
    });
    const { id } = await repository.create({
      launchedBy: null,
      projectId: project.id,
      pagesLimit: 10,
      startedAt: minutes(minute),
    });
    await repository.addCheckResults(id, results);
    await repository.finish(id, { finishedAt: minutes(minute + 1), pagesCrawled: 0 });
    return id;
  };
  return {
    record,
    issues: new ListIssues(repository, projects, checks),
    occurrences: new ListOccurrences(repository, projects, checks),
  };
};

describe('ListIssues', () => {
  it('lists every registry check, including those absent from the snapshot, sorted by id', async () => {
    const { record, issues } = setup();
    const id = await record(0, [result(15, ['a', 'b'])]);

    const rows = await issues.execute(ANONYMOUS_READER, id, {});

    expect(rows.map((row) => [row.checkId, row.count, row.examined])).toEqual([
      [2, 0, 0],
      [9, 0, 0],
      [15, 2, 4],
    ]);
    expect(rows[2]).toMatchObject({ label: 'Quinze', severity: 'warning', theme: 'on-page' });
  });

  it('adds delta, new and fixed counts against the previous finished snapshot', async () => {
    const { record, issues } = setup();
    await record(0, [result(15, ['a', 'b'])]);
    const id = await record(10, [result(15, ['b', 'c', 'd'])]);

    const row = (await issues.execute(ANONYMOUS_READER, id, {})).find(
      ({ checkId }) => checkId === 15,
    );

    expect(row).toMatchObject({ delta: 1, newCount: 2, fixedCount: 1 });
  });

  it('filters by severity', async () => {
    const { record, issues } = setup();
    const id = await record(0, []);

    const rows = await issues.execute(ANONYMOUS_READER, id, { severity: 'warning' });

    expect(rows.map(({ checkId }) => checkId)).toEqual([15]);
  });

  it('fails for an unknown snapshot', async () => {
    const { issues } = setup();

    await expect(issues.execute(ANONYMOUS_READER, 'nope', {})).rejects.toThrow(SnapshotNotFound);
  });
});

describe('ListOccurrences', () => {
  const urls = Array.from({ length: 25 }, (_, i) => `https://e.com/${String(i).padStart(2, '0')}`);

  it('paginates the occurrences in a stable order (page url, then info)', async () => {
    const { record, occurrences } = setup();
    const id = await record(0, [result(15, [...urls].reverse())]);

    const page = await occurrences.execute(ANONYMOUS_READER, id, 15, { page: 2, limit: 10 });

    expect(page.items.map(({ pageUrl }) => pageUrl)).toEqual(urls.slice(10, 20));
    expect(page).toMatchObject({ total: 25, page: 2, limit: 10 });
  });

  it('returns an empty list for a registry check without occurrences', async () => {
    const { record, occurrences } = setup();
    const id = await record(0, []);

    expect(
      await occurrences.execute(ANONYMOUS_READER, id, 9, { page: 1, limit: 50 }),
    ).toMatchObject({
      items: [],
      total: 0,
    });
  });

  it('fails for a check outside the registry', async () => {
    const { record, occurrences } = setup();
    const id = await record(0, []);

    await expect(
      occurrences.execute(ANONYMOUS_READER, id, 9999, { page: 1, limit: 50 }),
    ).rejects.toThrow(UnknownCheck);
  });
});
