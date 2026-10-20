import { describe, expect, it } from 'vitest';
import { DEFAULT_SOURCE_URL, resolveSourceUrl } from '../src/lib/source';

describe('resolveSourceUrl', () => {
  it('defaults to the upstream repository', () => {
    expect(resolveSourceUrl({})).toBe(DEFAULT_SOURCE_URL);
    expect(DEFAULT_SOURCE_URL).toBe('https://github.com/zero-strategie/zero-audit');
  });

  it('uses ZERO_AUDIT_SOURCE_URL so a modified deployment points to its own code', () => {
    expect(resolveSourceUrl({ ZERO_AUDIT_SOURCE_URL: 'https://git.example.com/fork' })).toBe(
      'https://git.example.com/fork',
    );
  });

  it('ignores an empty value', () => {
    expect(resolveSourceUrl({ ZERO_AUDIT_SOURCE_URL: '  ' })).toBe(DEFAULT_SOURCE_URL);
  });
});
