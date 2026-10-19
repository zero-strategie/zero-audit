import type { CheckResult, Severity } from './check.js';

const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'notice'];

const severityRank = ({ severity }: CheckResult): number => SEVERITY_ORDER.indexOf(severity);

/** Triggered checks only, most severe first, then most frequent, then lowest id. */
export const topIssues = (results: readonly CheckResult[], limit: number): CheckResult[] =>
  results
    .filter(({ count }) => count > 0)
    .sort((a, b) => severityRank(a) - severityRank(b) || b.count - a.count || a.checkId - b.checkId)
    .slice(0, limit);
