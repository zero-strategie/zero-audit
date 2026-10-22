import { describe, expect, it } from 'vitest';
import { traceRedirects } from '../../../src/domain/checks/page/redirect-trace.js';

const targets = (...pairs: [string, string][]): ReadonlyMap<string, string> => new Map(pairs);

describe('traceRedirects', () => {
  it('follows a chain up to its final destination', () => {
    expect(traceRedirects('x', targets(['x', 'a'], ['a', 'b'], ['b', 'c']))).toEqual({
      chain: ['a', 'b', 'c'],
      loop: false,
      truncated: false,
    });
  });

  it('reports a loop and lists the URL that closes it', () => {
    expect(traceRedirects('a', targets(['a', 'b'], ['b', 'a']))).toEqual({
      chain: ['b', 'a'],
      loop: true,
      truncated: false,
    });
  });

  it('reports a page redirecting to itself as a loop', () => {
    expect(traceRedirects('a', targets(['a', 'a']))).toEqual({
      chain: ['a'],
      loop: true,
      truncated: false,
    });
  });

  it('stops at 10 hops and flags the chain as truncated', () => {
    const pairs = Array.from({ length: 12 }, (_, i): [string, string] => [
      `p${String(i)}`,
      `p${String(i + 1)}`,
    ]);
    const trace = traceRedirects('p0', new Map(pairs));
    expect(trace.chain).toHaveLength(10);
    expect(trace).toMatchObject({ loop: false, truncated: true });
  });

  it('does not flag a chain of exactly 10 hops as truncated', () => {
    const pairs = Array.from({ length: 10 }, (_, i): [string, string] => [
      `p${String(i)}`,
      `p${String(i + 1)}`,
    ]);
    expect(traceRedirects('p0', new Map(pairs)).truncated).toBe(false);
  });
});
