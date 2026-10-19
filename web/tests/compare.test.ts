import { describe, expect, it } from 'vitest';
import { changedChecks, defaultComparisonPair } from '../src/lib/compare';
import { aCheckComparison, aSnapshotListing } from './fake-api-client';

describe('defaultComparisonPair', () => {
  it('compares the previous finished audit (A) with the latest finished one (B), ignoring failed audits', () => {
    const pair = defaultComparisonPair([
      aSnapshotListing({ id: 'old', startedAt: '2026-01-01T00:00:00.000Z' }),
      aSnapshotListing({ id: 'failed', status: 'failed', startedAt: '2026-03-01T00:00:00.000Z' }),
      aSnapshotListing({ id: 'new', startedAt: '2026-02-01T00:00:00.000Z' }),
    ]);

    expect(pair).toEqual({ a: 'old', b: 'new' });
  });

  it('has no default pair with fewer than two finished audits', () => {
    expect(defaultComparisonPair([aSnapshotListing()])).toBeNull();
  });
});

describe('changedChecks', () => {
  it('keeps only checks whose count, new or fixed occurrences changed', () => {
    const changed = aCheckComparison({ checkId: 1, delta: 2 });
    const fixedOnly = aCheckComparison({ checkId: 2, fixedCount: 1 });
    const same = aCheckComparison({ checkId: 3 });

    expect(changedChecks([changed, same, fixedOnly])).toEqual([changed, fixedOnly]);
  });
});
