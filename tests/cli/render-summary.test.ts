import { describe, expect, it } from 'vitest';
import type { SnapshotDetails } from '../../src/application/ports/snapshot-repository.js';
import type { CheckResult, Severity } from '../../src/domain/check.js';
import { Snapshot } from '../../src/domain/snapshot.js';
import type { SnapshotReport } from '../../src/application/get-snapshot-report.js';
import { buildScoreCard } from '../../src/domain/scoring.js';
import { classifyPages, groupVariation } from '../../src/domain/page-groups.js';
import { diffChecks } from '../../src/domain/snapshot-diff.js';
import { renderSummary } from '../../src/cli/render-summary.js';
import { makePage } from '../support/check-fixtures.js';

const result = (
  checkId: number,
  severity: Severity,
  count: number,
  examined: number,
): CheckResult => ({
  checkId,
  severity,
  theme: 'on-page',
  count,
  examined,
  occurrences: Array.from({ length: count }, () => ({ checkId, pageUrl: null, info: {} })),
});

const snapshot = Snapshot.restore({
  id: 'snap-1',
  projectId: 'proj-1',
  startedAt: new Date(0),
  finishedAt: new Date(1000),
  pagesCrawled: 6,
  pagesLimit: 10,
  status: 'finished',
});

const details: SnapshotDetails = {
  snapshot,
  pages: [
    makePage('https://e.com/1', { status: 200 }),
    makePage('https://e.com/2', { status: 204 }),
    makePage('https://e.com/3', { status: 301 }),
    makePage('https://e.com/4', { status: 404 }),
    makePage('https://e.com/5', { status: 503 }),
    makePage('https://e.com/6', { status: null, error: 'connection' }),
  ],
  links: [],
  checkResults: [
    result(103, 'warning', 2, 5),
    result(213, 'notice', 1, 4),
    result(2, 'error', 1, 6),
    result(1, 'error', 3, 6),
    result(15, 'warning', 0, 5),
  ],
};

const labels = new Map([
  [1, 'Erreurs serveur'],
  [2, 'Erreurs client'],
  [103, 'H1 absent'],
  [213, 'Lien entrant unique'],
  [15, 'Meta en double'],
]);

const previousResults: CheckResult[] = [
  result(103, 'warning', 0, 5),
  result(213, 'notice', 1, 4),
  result(2, 'error', 3, 6),
  result(1, 'error', 3, 6),
];

const report: SnapshotReport = {
  details,
  checkDiffs: diffChecks(previousResults, details.checkResults),
  scores: buildScoreCard(previousResults, details.checkResults),
  pageGroups: {
    counts: classifyPages(details.pages, details.checkResults).counts,
    variation: groupVariation(
      { healthy: 3, 'have-issues': 0, broken: 3, redirect: 1, blocked: 0 },
      classifyPages(details.pages, details.checkResults).counts,
    ),
  },
};

describe('renderSummary', () => {
  const lines = renderSummary(report, labels).split('\n');

  it('shows the health, its variation and every theme, https being not computable', () => {
    const text = lines.join('\n');
    expect(text).toContain('Santé du site : 70 / 100 (+13)');
    expect(text).toContain('on-page : 70 / 100 (+13)');
    expect(text).toContain('crawlability : non calculable');
    expect(text).toContain('https : non calculable');
    expect(text).toContain('linking : non calculable');
    expect(text).toContain('other : non calculable');
  });

  it('omits the variation when there is no previous snapshot', () => {
    const first = { ...report, scores: buildScoreCard(null, details.checkResults) };
    expect(renderSummary(first, labels)).toContain('Santé du site : 70 / 100\n');
  });

  it('shows the snapshot id and the page count per status class', () => {
    const text = lines.join('\n');
    expect(text).toContain('snap-1');
    expect(text).toMatch(/2xx\D+2\b/);
    expect(text).toMatch(/3xx\D+1\b/);
    expect(text).toMatch(/4xx\D+1\b/);
    expect(text).toMatch(/5xx\D+1\b/);
    expect(text).toMatch(/réseau\D+1\b/);
  });

  it('shows the number of occurrences per severity', () => {
    const text = lines.join('\n');
    expect(text).toMatch(/Erreurs\D+4\b/);
    expect(text).toMatch(/Avertissements\D+2\b/);
    expect(text).toMatch(/Notices\D+1\b/);
  });

  it('lists triggered checks sorted by severity then id, hiding zero counts', () => {
    const checkLines = lines.filter((line) => line.includes(' – '));
    expect(checkLines.map((line) => line.trim().split(' – ').slice(0, 3).join(' – '))).toEqual([
      '1 – Erreurs serveur – 3 / 6',
      '2 – Erreurs client – 1 / 6',
      '103 – H1 absent – 2 / 5',
      '213 – Lien entrant unique – 1 / 4',
    ]);
  });

  it('shows the signed delta, new and fixed occurrences of each check', () => {
    const checkLines = lines.filter((line) => line.includes(' – ')).map((line) => line.trim());
    expect(checkLines.map((line) => line.split(' – ').slice(3).join(' – '))).toEqual([
      'Δ 0 – nouvelles 0 – corrigées 0',
      'Δ -2 – nouvelles 0 – corrigées 2',
      'Δ +2 – nouvelles 2 – corrigées 0',
      'Δ 0 – nouvelles 0 – corrigées 0',
    ]);
  });

  it('shows the page count per group with its variation', () => {
    const text = lines.join('\n');
    expect(text).toContain('Saines : 2 (-1)');
    expect(text).toContain('Cassées : 3 (0)');
    expect(text).toContain('Redirigées : 1 (0)');
    expect(text).toContain('Bloquées : 0 (0)');
  });

  it('omits the group variation without a previous snapshot', () => {
    const first = {
      ...report,
      pageGroups: {
        ...report.pageGroups,
        variation: groupVariation(null, report.pageGroups.counts),
      },
    };
    expect(renderSummary(first, labels)).toContain('Saines : 2\n');
  });

  it('keeps blocked pages out of the status classes', () => {
    const blocked = makePage('https://e.com/p', {
      blockedByRobots: true,
      status: null,
      isHtml: false,
    });
    const withBlocked = {
      ...report,
      details: { ...details, pages: [...details.pages, blocked] },
    };
    expect(renderSummary(withBlocked, labels)).toMatch(/réseau\D+1\b/);
  });
});
