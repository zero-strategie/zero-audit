import { scrypt, type BinaryLike, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ScryptPasswordHasher } from '../../../src/infrastructure/crypto/scrypt-password-hasher.js';

const PASSWORD = 'correct horse battery';
const derive = promisify<BinaryLike, BinaryLike, number, ScryptOptions, Buffer>(scrypt);

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('hashes with a random salt, encodes the parameters, and verifies only the right password', async () => {
    const [first, second] = [await hasher.hash(PASSWORD), await hasher.hash(PASSWORD)];

    expect(first).not.toBe(second);
    expect(first).toMatch(/^scrypt\$32768\$8\$3\$/);
    expect(await hasher.verify(PASSWORD, first)).toBe(true);
    expect(await hasher.verify('correct horse batterx', first)).toBe(false);
  });

  it('reads the parameters from the stored hash, not from the current constants', async () => {
    const salt = Buffer.from('0123456789abcdef');
    const key = await derive(PASSWORD, salt, 64, { N: 1024, r: 4, p: 2 });
    const stored = `scrypt$1024$4$2$${salt.toString('base64')}$${key.toString('base64')}`;

    expect(await hasher.verify(PASSWORD, stored)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['wrong algorithm', 'bcrypt$1024$8$1$c2FsdA==$a2V5'],
    ['missing fields', 'scrypt$1024$8'],
    ['non numeric parameters', 'scrypt$x$8$1$c2FsdA==$a2V5'],
    ['N not a power of two', 'scrypt$1000$8$1$c2FsdA==$a2V5'],
    ['N above the bound', 'scrypt$1073741824$8$1$c2FsdA==$a2V5'],
    ['empty key', 'scrypt$1024$8$1$c2FsdA==$'],
  ])('returns false without throwing for a malformed hash (%s)', async (_label, stored) => {
    expect(await hasher.verify(PASSWORD, stored)).toBe(false);
  });

  it('runs a real scrypt computation in verifyDummy and answers false', async () => {
    let derivations = 0;
    const counting = new ScryptPasswordHasher({
      deriveKey: (password, salt, keyLength, options) => {
        derivations += 1;
        return derive(password, salt, keyLength, options);
      },
    });
    await counting.verifyDummy(PASSWORD); // settle the precomputed dummy hash
    const before = derivations;

    expect(await counting.verifyDummy(PASSWORD)).toBe(false);
    expect(derivations).toBe(before + 1);
  });
});
