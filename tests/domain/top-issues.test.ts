import { describe, expect, it } from 'vitest';
import type { CheckResult, Severity } from '../../src/domain/check.js';
import { topIssues } from '../../src/domain/top-issues.js';

const result = (checkId: number, severity: Severity, count: number): CheckResult => ({
  checkId,
  severity,
  theme: 'on-page',
  count,
  examined: 10,
  occurrences: [],
});

describe('topIssues', () => {
  it('ignores checks without occurrences', () => {
    expect(topIssues([result(1, 'error', 0), result(2, 'notice', 1)], 5)).toEqual([
      result(2, 'notice', 1),
    ]);
  });

  it('sorts by severity, then by descending count, then by id', () => {
    const sorted = topIssues(
      [
        result(9, 'notice', 50),
        result(7, 'warning', 2),
        result(5, 'warning', 2),
        result(8, 'warning', 4),
        result(3, 'error', 1),
      ],
      5,
    );
    expect(sorted.map(({ checkId }) => checkId)).toEqual([3, 8, 5, 7, 9]);
  });

  it('keeps only the requested number of checks', () => {
    const results = [1, 2, 3, 4].map((id) => result(id, 'error', 1));
    expect(topIssues(results, 2).map(({ checkId }) => checkId)).toEqual([1, 2]);
  });

  it('does not modify its input', () => {
    const results = [result(2, 'notice', 1), result(1, 'error', 1)];
    topIssues(results, 5);
    expect(results.map(({ checkId }) => checkId)).toEqual([2, 1]);
  });
});
