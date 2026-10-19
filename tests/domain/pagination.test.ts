import { describe, expect, it } from 'vitest';
import { paginate } from '../../src/domain/pagination.js';

const items = Array.from({ length: 25 }, (_, index) => index + 1);

describe('paginate', () => {
  it('returns the requested slice with the total, page and limit', () => {
    expect(paginate(items, { page: 2, limit: 10 })).toEqual({
      items: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      total: 25,
      page: 2,
      limit: 10,
    });
  });

  it('returns a partial last page and an empty page beyond the end', () => {
    expect(paginate(items, { page: 3, limit: 10 }).items).toEqual([21, 22, 23, 24, 25]);
    expect(paginate(items, { page: 4, limit: 10 }).items).toEqual([]);
  });
});
