import { describe, expect, it } from 'vitest';
import type { SnapshotDetails } from '../../src/application/ports/snapshot-repository.js';
import type { CheckResult, Severity } from '../../src/domain/check.js';
import { Snapshot } from '../../src/domain/snapshot.js';
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
  theme: 'markup',
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

describe('renderSummary', () => {
  const lines = renderSummary(details, labels).split('\n');

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
    expect(checkLines.map((line) => line.trim())).toEqual([
      '1 – Erreurs serveur – 3 / 6',
      '2 – Erreurs client – 1 / 6',
      '103 – H1 absent – 2 / 5',
      '213 – Lien entrant unique – 1 / 4',
    ]);
  });
});
