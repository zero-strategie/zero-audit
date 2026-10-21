import { describe, expect, it } from 'vitest';
import {
  ADMIN_MAX_PAGES,
  FREE_AUDITS_PER_WINDOW,
  FREE_MAX_PAGES,
  QUOTA_WINDOW_MS,
  allowanceOf,
  auditQuotaOf,
} from '../../src/domain/quota.js';

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date('2026-05-04T09:00:00.000Z');
const hoursAgo = (hours: number): Date => new Date(NOW.getTime() - hours * HOUR_MS);

describe('allowanceOf', () => {
  it('gives a free account 100 pages and 3 audits per 24 hours', () => {
    expect(allowanceOf(false)).toEqual({ maxPages: FREE_MAX_PAGES, auditsPerWindow: 3 });
    expect([FREE_MAX_PAGES, FREE_AUDITS_PER_WINDOW, QUOTA_WINDOW_MS]).toEqual([
      100,
      3,
      24 * HOUR_MS,
    ]);
  });

  it('gives an administrator 500 pages and no per-account audit quota', () => {
    expect(allowanceOf(true)).toEqual({ maxPages: ADMIN_MAX_PAGES, auditsPerWindow: null });
    expect(ADMIN_MAX_PAGES).toBe(500);
  });
});

describe('auditQuotaOf', () => {
  const free = allowanceOf(false);

  it('leaves all the audits when none was launched', () => {
    expect(auditQuotaOf(free, [])).toEqual({ remaining: 3, nextAvailableAt: null });
  });

  it('counts the launches and keeps the next slot unknown while some remain', () => {
    expect(auditQuotaOf(free, [hoursAgo(5)])).toEqual({ remaining: 2, nextAvailableAt: null });
  });

  it('frees the next slot 24 hours after the oldest launch once the quota is spent', () => {
    const launches = [hoursAgo(10), hoursAgo(2), hoursAgo(5)];

    expect(auditQuotaOf(free, launches)).toEqual({
      remaining: 0,
      nextAvailableAt: new Date(hoursAgo(10).getTime() + QUOTA_WINDOW_MS),
    });
  });

  it('frees the slot of the launch that makes the count drop below the limit', () => {
    const launches = [hoursAgo(10), hoursAgo(8), hoursAgo(6), hoursAgo(4)];

    expect(auditQuotaOf(free, launches).nextAvailableAt).toEqual(
      new Date(hoursAgo(8).getTime() + QUOTA_WINDOW_MS),
    );
  });

  it('has no limit for an administrator', () => {
    expect(
      auditQuotaOf(allowanceOf(true), [hoursAgo(1), hoursAgo(2), hoursAgo(3), hoursAgo(4)]),
    ).toEqual({ remaining: null, nextAvailableAt: null });
  });
});
