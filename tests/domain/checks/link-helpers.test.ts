import { describe, expect, it } from 'vitest';
import { hasRelToken, targetsBySource } from '../../../src/domain/checks/link-helpers.js';
import { makeLink, u } from '../../support/check-fixtures.js';

describe('hasRelToken', () => {
  it('matches a token case-insensitively among several', () => {
    expect(hasRelToken('noopener NoFollow', 'nofollow')).toBe(true);
  });

  it('does not match a longer token or a null rel', () => {
    expect(hasRelToken('nofollowed', 'nofollow')).toBe(false);
    expect(hasRelToken(null, 'nofollow')).toBe(false);
  });
});

describe('targetsBySource', () => {
  it('groups the kept links by source with sorted, de-duplicated targets', () => {
    const links = [
      makeLink(u('a'), u('z')),
      makeLink(u('a'), u('b')),
      makeLink(u('a'), u('b')),
      makeLink(u('c'), u('x')),
      makeLink(u('d'), u('y'), { type: 'external' }),
    ];

    const grouped = targetsBySource(links, (link) => link.type === 'internal');

    expect([...grouped]).toEqual([
      [u('a'), [u('b'), u('z')]],
      [u('c'), [u('x')]],
    ]);
  });
});
