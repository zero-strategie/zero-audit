import { describe, expect, it } from 'vitest';
import { buildPaginationLinks, parsePageParam } from '../src/lib/pagination';

describe('buildPaginationLinks', () => {
  it('has a next page and no previous page on page 1 of 120 items', () => {
    expect(buildPaginationLinks(1, 50, 120)).toEqual({ previous: null, next: 2 });
  });
  it('has both links on a middle page', () => {
    expect(buildPaginationLinks(2, 50, 120)).toEqual({ previous: 1, next: 3 });
  });
  it('has a previous page and no next page on the last page', () => {
    expect(buildPaginationLinks(3, 50, 120)).toEqual({ previous: 2, next: null });
  });
  it('has no next page when the total fits exactly in the page', () => {
    expect(buildPaginationLinks(1, 50, 50)).toEqual({ previous: null, next: null });
  });
});

describe('parsePageParam', () => {
  it('defaults to page 1 when absent', () => {
    expect(parsePageParam(null)).toBe(1);
  });
  it('parses a positive integer', () => {
    expect(parsePageParam('3')).toBe(3);
  });
  it.each(['abc', '0', '-2', '1.5', ''])('falls back to page 1 for %j', (raw) => {
    expect(parsePageParam(raw)).toBe(1);
  });
});
