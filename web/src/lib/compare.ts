import type { CheckComparison, SnapshotListing } from './api/types';

export interface ComparisonPair {
  a: string;
  b: string;
}

/** A = the finished audit before the latest finished one (B). Failed and running audits are ignored. */
export const defaultComparisonPair = (snapshots: SnapshotListing[]): ComparisonPair | null => {
  const finished = snapshots
    .filter(({ status }) => status === 'finished')
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  const [latest, previous] = finished;
  return latest && previous ? { a: previous.id, b: latest.id } : null;
};

export const changedChecks = (checks: CheckComparison[]): CheckComparison[] =>
  checks.filter(
    ({ delta, newCount, fixedCount }) => delta !== 0 || newCount !== 0 || fixedCount !== 0,
  );
