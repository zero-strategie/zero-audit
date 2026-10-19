import type { CheckResult, IssueOccurrence } from './check.js';

export interface CheckDiff {
  readonly checkId: number;
  readonly count: number;
  readonly delta: number;
  readonly newCount: number;
  readonly fixedCount: number;
  readonly added: readonly IssueOccurrence[];
  readonly removed: readonly IssueOccurrence[];
}

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, nested]) => [key, sortKeys(nested)]),
  );
};

/** JSON with object keys sorted at every depth, so equal data always serializes identically. */
export const canonicalJson = (value: unknown): string => JSON.stringify(sortKeys(value));

/** Identity of an occurrence across snapshots: check + page + canonical info. */
export const occurrenceKey = (occurrence: IssueOccurrence): string =>
  canonicalJson([occurrence.checkId, occurrence.pageUrl, occurrence.info]);

const groupByKey = (occurrences: readonly IssueOccurrence[]): Map<string, IssueOccurrence[]> => {
  const groups = new Map<string, IssueOccurrence[]>();
  for (const occurrence of occurrences) {
    const key = occurrenceKey(occurrence);
    groups.set(key, [...(groups.get(key) ?? []), occurrence]);
  }
  return groups;
};

/** Occurrences of `from` that have no counterpart in `other`; identical occurrences pair up one to one. */
const unmatched = (
  from: Map<string, IssueOccurrence[]>,
  other: Map<string, IssueOccurrence[]>,
): IssueOccurrence[] =>
  [...from].flatMap(([key, group]) => group.slice(other.get(key)?.length ?? 0));

const diffCheck = (previous: readonly IssueOccurrence[], current: CheckResult): CheckDiff => {
  const before = groupByKey(previous);
  const after = groupByKey(current.occurrences);
  const added = unmatched(after, before);
  const removed = unmatched(before, after);
  return {
    checkId: current.checkId,
    count: current.count,
    delta: current.count - previous.length,
    newCount: added.length,
    fixedCount: removed.length,
    added,
    removed,
  };
};

/** Without a previous snapshot, delta is 0 and every occurrence counts as new. */
export const diffChecks = (
  previous: readonly CheckResult[] | null,
  current: readonly CheckResult[],
): CheckDiff[] => {
  if (previous === null) {
    return current.map((result) => ({
      ...diffCheck([], result),
      delta: 0,
    }));
  }
  const previousById = new Map(previous.map((result) => [result.checkId, result.occurrences]));
  return current.map((result) => diffCheck(previousById.get(result.checkId) ?? [], result));
};
