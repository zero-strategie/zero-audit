import { describe, expect, it } from 'vitest';
import { nextSort, parseSortParam } from '../src/lib/sorting';

describe('nextSort', () => {
  it('sorts ascending on first click of a column', () => {
    expect(nextSort('url', 'status')).toBe('status');
  });
  it('sorts descending on second click', () => {
    expect(nextSort('status', 'status')).toBe('-status');
  });
  it('goes back to ascending on third click', () => {
    expect(nextSort('-status', 'status')).toBe('status');
  });
});

describe('parseSortParam', () => {
  it('defaults to url when absent', () => {
    expect(parseSortParam(null)).toEqual({ kind: 'valid', sort: 'url' });
  });
  it('accepts ascending and descending known columns', () => {
    expect(parseSortParam('-responseTime')).toEqual({ kind: 'valid', sort: '-responseTime' });
  });
  it('reports an unknown value', () => {
    expect(parseSortParam('inconnu')).toEqual({ kind: 'invalid', raw: 'inconnu' });
  });
});
