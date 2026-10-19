import { describe, expect, it } from 'vitest';
import type { SnapshotComparison } from '../../src/application/compare-snapshots.js';
import { renderComparison } from '../../src/cli/render-compare.js';
import type { CheckResult } from '../../src/domain/check.js';
import { Snapshot } from '../../src/domain/snapshot.js';
import { buildScoreCard } from '../../src/domain/scoring.js';
import type { CheckDiff } from '../../src/domain/snapshot-diff.js';

const snapshot = (id: string): Snapshot =>
  Snapshot.restore({
    id,
    projectId: 'p',
    startedAt: new Date(0),
    finishedAt: new Date(1),
    pagesCrawled: 1,
    pagesLimit: 1,
    status: 'finished',
  });

const occurrence = (pageUrl: string) => ({ checkId: 15, pageUrl, info: {} });

const diff = (overrides: Partial<CheckDiff>): CheckDiff => ({
  checkId: 15,
  count: 0,
  delta: 0,
  newCount: 0,
  fixedCount: 0,
  added: [],
  removed: [],
  ...overrides,
});

const CHECK_15: CheckResult = {
  checkId: 15,
  severity: 'warning',
  theme: 'on-page',
  count: 0,
  examined: 5,
  occurrences: [],
};

const comparison = (...checkDiffs: CheckDiff[]): SnapshotComparison => ({
  base: snapshot('snap-a'),
  target: snapshot('snap-b'),
  checkDiffs,
  scores: buildScoreCard([{ ...CHECK_15, count: 2 }], [{ ...CHECK_15, count: 1 }]),
});

const labels = new Map([[15, 'Meta descriptions en double']]);

describe('renderComparison', () => {
  it('lists per check countA, countB, delta, new and fixed, then added and removed occurrences', () => {
    const output = renderComparison(
      comparison(
        diff({
          count: 3,
          delta: 1,
          newCount: 2,
          fixedCount: 1,
          added: [occurrence('https://e.com/new1'), occurrence('https://e.com/new2')],
          removed: [occurrence('https://e.com/old')],
        }),
      ),
      labels,
    );

    expect(output).toContain('snap-a');
    expect(output).toContain('snap-b');
    expect(output).toContain(
      '15 – Meta descriptions en double – A 2 → B 3 – Δ +1 – nouvelles 2 – corrigées 1',
    );
    expect(output).toContain('+ https://e.com/new1');
    expect(output).toContain('+ https://e.com/new2');
    expect(output).toContain('- https://e.com/old');
    expect(output).not.toContain('Aucune différence');
  });

  it('shows the health and each theme with their variation between A and B', () => {
    const output = renderComparison(comparison(diff({ count: 1 })), labels);

    expect(output).toContain('Santé du site : A 60 → B 80 (+20)');
    expect(output).toContain('on-page : A 60 → B 80 (+20)');
    expect(output).toContain('https : non calculable');
  });

  it('states there is no difference when nothing changed', () => {
    const output = renderComparison(comparison(diff({ count: 2 })), labels);

    expect(output).toContain('Aucune différence');
    expect(output).toContain('A 2 → B 2 – Δ 0 – nouvelles 0 – corrigées 0');
  });
});
