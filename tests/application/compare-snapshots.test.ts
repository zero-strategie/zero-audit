import { describe, expect, it } from 'vitest';
import { CompareSnapshots } from '../../src/application/compare-snapshots.js';
import type { CheckResult } from '../../src/domain/check.js';
import {
  SnapshotNotFinished,
  SnapshotNotFound,
  SnapshotsFromDifferentProjects,
} from '../../src/domain/errors.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';

const minutes = (n: number): Date => new Date(Date.UTC(2026, 0, 1, 10, n));

const check15 = (...paths: string[]): CheckResult => ({
  checkId: 15,
  severity: 'warning',
  theme: 'on-page',
  count: paths.length,
  examined: 5,
  occurrences: paths.map((path) => ({ checkId: 15, pageUrl: `https://e.com/${path}`, info: {} })),
});

const build = () => {
  const repository = new InMemorySnapshotRepository();
  const record = async (
    projectId: string,
    startMinute: number,
    outcome: 'finished' | 'failed' | 'running',
    results: CheckResult[] = [],
  ): Promise<string> => {
    const snapshot = await repository.create({
      projectId,
      pagesLimit: 10,
      startedAt: minutes(startMinute),
    });
    await repository.addCheckResults(snapshot.id, results);
    if (outcome === 'finished') {
      await repository.finish(snapshot.id, {
        finishedAt: minutes(startMinute + 1),
        pagesCrawled: 1,
      });
    } else if (outcome === 'failed') {
      await repository.fail(snapshot.id, minutes(startMinute + 1));
    }
    return snapshot.id;
  };
  return { record, useCase: new CompareSnapshots(repository) };
};

describe('CompareSnapshots', () => {
  it('diffs the target B against the base A, even when A is the more recent one', async () => {
    const { record, useCase } = build();
    const b = await record('p', 0, 'finished', [check15('o1', 'o2', 'o3')]);
    const a = await record('p', 10, 'finished', [check15('o1')]);

    const comparison = await useCase.execute(a, b);

    expect(comparison.base.id).toBe(a);
    expect(comparison.target.id).toBe(b);
    expect(comparison.checkDiffs).toMatchObject([
      { checkId: 15, count: 3, delta: 2, newCount: 2, fixedCount: 0 },
    ]);
  });

  it('rejects an unknown snapshot', async () => {
    const { record, useCase } = build();
    const a = await record('p', 0, 'finished');
    await expect(useCase.execute(a, 'missing')).rejects.toBeInstanceOf(SnapshotNotFound);
    await expect(useCase.execute('missing', a)).rejects.toBeInstanceOf(SnapshotNotFound);
  });

  it('rejects snapshots of different projects', async () => {
    const { record, useCase } = build();
    const a = await record('p1', 0, 'finished');
    const b = await record('p2', 1, 'finished');
    await expect(useCase.execute(a, b)).rejects.toBeInstanceOf(SnapshotsFromDifferentProjects);
  });

  it.each(['running', 'failed'] as const)('rejects a %s snapshot', async (outcome) => {
    const { record, useCase } = build();
    const a = await record('p', 0, 'finished');
    const b = await record('p', 5, outcome);
    await expect(useCase.execute(a, b)).rejects.toBeInstanceOf(SnapshotNotFinished);
    await expect(useCase.execute(b, a)).rejects.toBeInstanceOf(SnapshotNotFinished);
  });

  it('scores B with its variation against A', async () => {
    const { record, useCase } = build();
    const a = await record('p', 0, 'finished', [check15('o1')]);
    const b = await record('p', 10, 'finished', [check15('o1', 'o2')]);

    const comparison = await useCase.execute(a, b);

    expect(comparison.scores.health).toEqual({ score: 60, variation: -20 });
    expect(comparison.scores.themes['on-page']).toEqual({ score: 60, variation: -20 });
  });
});
