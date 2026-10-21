import { describe, expect, it } from 'vitest';
import { RandomTokenGenerator } from '../../../src/infrastructure/crypto/random-token-generator.js';

const TOKEN_BYTES = 32;

describe('RandomTokenGenerator', () => {
  it('encodes 32 random bytes as URL-safe base64, differently each time', () => {
    const generator = new RandomTokenGenerator();

    const first = generator.generate();
    const second = generator.generate();

    expect(Buffer.from(first, 'base64url')).toHaveLength(TOKEN_BYTES);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });
});
