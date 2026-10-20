import { describe, expect, it } from 'vitest';
import { ALLOWED_LIMITS, DEFAULT_LIMIT, relaunchLimit } from '../src/lib/audit-limits';

describe('audit limits', () => {
  it('offers 50, 100, 250 and 500 pages with 100 by default', () => {
    expect(ALLOWED_LIMITS).toEqual([50, 100, 250, 500]);
    expect(DEFAULT_LIMIT).toBe(100);
  });

  it.each([50, 100, 250, 500])('relaunches with the previous limit of %i', (limit) => {
    expect(relaunchLimit(limit)).toBe(limit);
  });

  it.each([0, 75, 1000, 99])('falls back to 100 for the unlisted limit %i', (limit) => {
    expect(relaunchLimit(limit)).toBe(100);
  });
});
