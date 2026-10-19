import type { CheckResult, Severity } from './check.js';

const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'notice'];

const severityRank = ({ severity }: CheckResult): number => SEVERITY_ORDER.indexOf(severity);

/** Triggered checks only, most severe first, then most frequent, then lowest id. */
export const topIssues = (results: readonly CheckResult[], limit: number): CheckResult[] =>
  results
    .filter(({ count }) => count > 0)
    .sort((a, b) => severityRank(a) - severityRank(b) || b.count - a.count || a.checkId - b.checkId)
    .slice(0, limit);

export type SeverityCounts = Readonly<Record<Severity, number>>;

/** Total occurrences per severity. */
export const countBySeverity = (results: readonly CheckResult[]): SeverityCounts => {
  const totals: Record<Severity, number> = { error: 0, warning: 0, notice: 0 };
  for (const { severity, count } of results) totals[severity] += count;
  return totals;
};
