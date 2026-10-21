import { describe, expect, it } from 'vitest';
import { InvalidEmail } from '../../src/domain/errors.js';
import { normalizeEmail } from '../../src/domain/user.js';

describe('normalizeEmail', () => {
  it('trims and lowercases the address', () => {
    expect(normalizeEmail('  Alice@Example.FR  ')).toBe('alice@example.fr');
  });

  it('rejects an address longer than 254 characters', () => {
    const tooLong = `${'a'.repeat(250)}@x.fr`;
    expect(() => normalizeEmail(tooLong)).toThrow(InvalidEmail);
  });

  it('accepts an address of exactly 254 characters', () => {
    const limit = `${'a'.repeat(249)}@x.fr`;
    expect(normalizeEmail(limit)).toHaveLength(254);
  });

  it('rejects an address without an at sign', () => {
    expect(() => normalizeEmail('alice.example.fr')).toThrow(InvalidEmail);
  });
});
