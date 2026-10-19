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

const occurrencesByKey = (occurrences: readonly IssueOccurrence[]): Map<string, IssueOccurrence> =>
  new Map(occurrences.map((occurrence) => [occurrenceKey(occurrence), occurrence]));

const diffCheck = (previous: readonly IssueOccurrence[], current: CheckResult): CheckDiff => {
  const before = occurrencesByKey(previous);
  const after = occurrencesByKey(current.occurrences);
  const added = [...after].filter(([key]) => !before.has(key)).map(([, o]) => o);
  const removed = [...before].filter(([key]) => !after.has(key)).map(([, o]) => o);
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
