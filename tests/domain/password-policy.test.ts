import { describe, expect, it } from 'vitest';
import { InvalidPassword } from '../../src/domain/errors.js';
import { assertValidPassword } from '../../src/domain/password-policy.js';

describe('assertValidPassword', () => {
  it.each([11, 129])('rejects a password of %i characters', (length) => {
    expect(() => {
      assertValidPassword('a'.repeat(length));
    }).toThrow(InvalidPassword);
  });

  it.each([12, 128])('accepts a password of %i characters, with no composition rule', (length) => {
    expect(() => {
      assertValidPassword('a'.repeat(length));
    }).not.toThrow();
  });
});
