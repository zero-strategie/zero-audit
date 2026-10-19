import { describe, expect, it } from 'vitest';
import { GetSnapshotReport } from '../../src/application/get-snapshot-report.js';
import type { CheckResult } from '../../src/domain/check.js';
import type { Page } from '../../src/domain/crawl.js';
import { SnapshotNotFound } from '../../src/domain/errors.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { makePage } from '../support/check-fixtures.js';

const PROJECT = 'project-1';
const minutes = (n: number): Date => new Date(Date.UTC(2026, 0, 1, 10, n));

const check15 = (...paths: string[]): CheckResult => ({
  checkId: 15,
  severity: 'warning',
  theme: 'on-page',
  count: paths.length,
  examined: 5,
  occurrences: paths.map((path) => ({
    checkId: 15,
    pageUrl: `https://e.com/${path}`,
    info: {},
  })),
});

const build = () => {
  const repository = new InMemorySnapshotRepository();
  const record = async (
    startMinute: number,
    outcome: 'finished' | 'failed',
    results: CheckResult[],
    pages: Page[] = [],
  ): Promise<string> => {
    const snapshot = await repository.create({
      projectId: PROJECT,
      pagesLimit: 10,
      startedAt: minutes(startMinute),
    });
    await repository.addPages(snapshot.id, pages);
    await repository.addCheckResults(snapshot.id, results);
    if (outcome === 'finished') {
      await repository.finish(snapshot.id, {
        finishedAt: minutes(startMinute + 1),
        pagesCrawled: 1,
      });
    } else {
      await repository.fail(snapshot.id, minutes(startMinute + 1));
    }
    return snapshot.id;
  };
  return { record, useCase: new GetSnapshotReport(repository) };
};

describe('GetSnapshotReport', () => {
  it('counts pages per group with the variation against the previous snapshot', async () => {
    const { record, useCase } = build();
    const healthy = (name: string) => makePage(`https://e.com/${name}`);
    await record(0, 'finished', [], [healthy('a'), healthy('b')]);
    const blocked = makePage('https://e.com/p', { blockedByRobots: true, status: null });
    const current = await record(10, 'finished', [], [healthy('a'), blocked]);

    const { pageGroups } = await useCase.execute(current);

    expect(pageGroups.counts).toMatchObject({ healthy: 1, blocked: 1 });
    expect(pageGroups.variation).toMatchObject({ healthy: -1, blocked: 1 });
  });

  it('has no group variation without a previous finished snapshot', async () => {
    const { record, useCase } = build();
    const current = await record(0, 'finished', [], [makePage('https://e.com/a')]);

    const { pageGroups } = await useCase.execute(current);

    expect(pageGroups.variation.healthy).toBeNull();
  });

  it('compares the snapshot with the previous finished one', async () => {
    const { record, useCase } = build();
    await record(0, 'finished', [check15('o1', 'o2')]);
    const current = await record(10, 'finished', [check15('o2', 'o3')]);

    const report = await useCase.execute(current);

    expect(report.checkDiffs).toMatchObject([
      { checkId: 15, delta: 0, newCount: 1, fixedCount: 1 },
    ]);
    expect(report.details.snapshot.id).toBe(current);
  });

  it('treats every occurrence as new for the first snapshot of a project', async () => {
    const { record, useCase } = build();
    const first = await record(0, 'finished', [check15('o1', 'o2')]);

    const report = await useCase.execute(first);

    expect(report.checkDiffs).toMatchObject([{ delta: 0, newCount: 2, fixedCount: 0, count: 2 }]);
  });

  it('skips a failed snapshot and compares with the older finished one', async () => {
    const { record, useCase } = build();
    await record(0, 'finished', [check15('o1', 'o2', 'o3')]);
    await record(10, 'failed', [check15('o9')]);
    const current = await record(20, 'finished', [check15('o1')]);

    const report = await useCase.execute(current);

    expect(report.checkDiffs).toMatchObject([{ delta: -2, newCount: 0, fixedCount: 2 }]);
  });

  it('gives zero deltas for two identical audits', async () => {
    const { record, useCase } = build();
    await record(0, 'finished', [check15('o1', 'o2')]);
    const current = await record(10, 'finished', [check15('o2', 'o1')]);

    const report = await useCase.execute(current);

    expect(report.checkDiffs).toMatchObject([{ delta: 0, newCount: 0, fixedCount: 0 }]);
  });

  it('throws SnapshotNotFound for an unknown snapshot id', async () => {
    const { useCase } = build();

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(SnapshotNotFound);
  });

  it('scores the snapshot and its variation since the previous finished one', async () => {
    const { record, useCase } = build();
    await record(0, 'finished', [check15('o1', 'o2')]);
    const current = await record(10, 'finished', [check15('o1')]);

    const report = await useCase.execute(current);

    expect(report.scores.health).toEqual({ score: 80, variation: 20 });
    expect(report.scores.themes['on-page']).toEqual({ score: 80, variation: 20 });
    expect(report.scores.themes.https).toEqual({ score: null, variation: null });
  });

  it('has no score variation for the first snapshot of a project', async () => {
    const { record, useCase } = build();
    const first = await record(0, 'finished', [check15('o1')]);

    const report = await useCase.execute(first);

    expect(report.scores.health).toEqual({ score: 80, variation: null });
  });

  it('totals the occurrences per severity', async () => {
    const { record, useCase } = build();
    const error: CheckResult = { ...check15('o1'), checkId: 2, severity: 'error', count: 4 };
    const id = await record(0, 'finished', [check15('o1', 'o2'), error]);

    const report = await useCase.execute(id);

    expect(report.severityCounts).toEqual({ error: 4, warning: 2, notice: 0 });
  });

  it('lists the five most pressing checks', async () => {
    const { record, useCase } = build();
    const results = [1, 2, 3, 4, 5, 6].map((checkId): CheckResult => ({
      ...check15('o1'),
      checkId,
      count: checkId,
    }));
    const id = await record(0, 'finished', results);

    const report = await useCase.execute(id);

    expect(report.topIssues.map(({ checkId }) => checkId)).toEqual([6, 5, 4, 3, 2]);
  });
});
