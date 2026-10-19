import { describe, expect, it } from 'vitest';
import { computeRedirectChain } from '../../src/domain/redirect-chain.js';

const targets = (...pairs: [string, string][]) => new Map(pairs);

describe('computeRedirectChain', () => {
  it('returns an empty chain for a URL that does not redirect', () => {
    expect(computeRedirectChain('https://a.test/', targets())).toEqual([]);
  });

  it('lists every URL followed after the start URL', () => {
    const chain = computeRedirectChain(
      'https://a.test/1',
      targets(['https://a.test/1', 'https://a.test/2'], ['https://a.test/2', 'https://a.test/3']),
    );

    expect(chain).toEqual(['https://a.test/2', 'https://a.test/3']);
  });

  it('stops at 10 hops on a chain of 12 redirects', () => {
    const pairs: [string, string][] = Array.from({ length: 12 }, (_, i) => [
      `https://a.test/${String(i)}`,
      `https://a.test/${String(i + 1)}`,
    ]);

    const chain = computeRedirectChain('https://a.test/0', targets(...pairs));

    expect(chain).toHaveLength(10);
    expect(chain.at(-1)).toBe('https://a.test/10');
  });

  it('stops when the chain loops back', () => {
    const chain = computeRedirectChain(
      'https://a.test/x',
      targets(['https://a.test/x', 'https://a.test/y'], ['https://a.test/y', 'https://a.test/x']),
    );

    expect(chain).toEqual(['https://a.test/y']);
  });
});
