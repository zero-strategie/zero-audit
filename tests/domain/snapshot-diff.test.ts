import { describe, expect, it } from 'vitest';
import type { CheckResult, IssueOccurrence } from '../../src/domain/check.js';
import { canonicalJson, diffChecks, occurrenceKey } from '../../src/domain/snapshot-diff.js';

const occurrence = (checkId: number, pageUrl: string): IssueOccurrence => ({
  checkId,
  pageUrl,
  info: {},
});

const result = (checkId: number, occurrences: IssueOccurrence[]): CheckResult => ({
  checkId,
  severity: 'warning',
  theme: 'markup',
  count: occurrences.length,
  examined: 10,
  occurrences,
});

describe('canonicalJson', () => {
  it('serializes objects identically whatever the key order', () => {
    expect(canonicalJson({ b: 1, a: [2] })).toBe(canonicalJson({ a: [2], b: 1 }));
  });

  it('sorts keys of nested objects but keeps array order', () => {
    expect(canonicalJson({ z: { b: 1, a: 2 }, l: [3, 1] })).toBe('{"l":[3,1],"z":{"a":2,"b":1}}');
  });
});

describe('occurrenceKey', () => {
  it('differs when the page url or the info differs', () => {
    const base = { checkId: 1, pageUrl: 'https://e.com/a', info: { x: 1 } };
    expect(occurrenceKey(base)).toBe(occurrenceKey({ ...base, info: { x: 1 } }));
    expect(occurrenceKey(base)).not.toBe(occurrenceKey({ ...base, pageUrl: 'https://e.com/b' }));
    expect(occurrenceKey(base)).not.toBe(occurrenceKey({ ...base, info: { x: 2 } }));
    expect(occurrenceKey(base)).not.toBe(occurrenceKey({ ...base, pageUrl: null }));
  });
});

describe('diffChecks', () => {
  const o1 = occurrence(15, 'https://e.com/1');
  const o2 = occurrence(15, 'https://e.com/2');
  const o3 = occurrence(15, 'https://e.com/3');

  it('reports new and fixed occurrences with a zero delta when counts are equal', () => {
    const [diff] = diffChecks([result(15, [o1, o2])], [result(15, [o2, o3])]);

    expect(diff).toMatchObject({ checkId: 15, count: 2, delta: 0, newCount: 1, fixedCount: 1 });
    expect(diff?.added).toEqual([o3]);
    expect(diff?.removed).toEqual([o1]);
  });

  it('reports a negative delta when occurrences are fixed', () => {
    const [diff] = diffChecks(
      [
        result(
          8,
          [o1, o2, o3].map((o) => ({ ...o, checkId: 8 })),
        ),
      ],
      [result(8, [{ ...o1, checkId: 8 }])],
    );

    expect(diff).toMatchObject({ checkId: 8, count: 1, delta: -2, newCount: 0, fixedCount: 2 });
  });

  it('treats every occurrence as new without a previous snapshot', () => {
    const diffs = diffChecks(null, [result(15, [o1, o2]), result(3, [])]);

    expect(diffs).toMatchObject([
      { checkId: 15, count: 2, delta: 0, newCount: 2, fixedCount: 0 },
      { checkId: 3, count: 0, delta: 0, newCount: 0, fixedCount: 0 },
    ]);
  });

  it('gives zero deltas for identical results', () => {
    const results = [result(15, [o1, o2])];

    expect(diffChecks(results, results)).toMatchObject([{ delta: 0, newCount: 0, fixedCount: 0 }]);
  });

  it('treats a check absent from the previous snapshot as having no occurrence', () => {
    const [diff] = diffChecks([], [result(15, [o1])]);

    expect(diff).toMatchObject({ delta: 1, newCount: 1, fixedCount: 0 });
  });

  it('pairs identical occurrences one to one', () => {
    const same = occurrence(15, 'https://e.com/1');

    const [diff] = diffChecks([result(15, [same])], [result(15, [same, same])]);

    expect(diff).toMatchObject({ delta: 1, newCount: 1, fixedCount: 0 });
  });
});
