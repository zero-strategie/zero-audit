import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type BinaryLike,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';
import type { PasswordHasher } from '../../application/ports/password-hasher.js';

const ALGORITHM = 'scrypt';
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELISM = 3;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;
const DUMMY_PASSWORD = 'unknown-account-placeholder';

/** Bounds applied to parameters read from a stored hash, so that a corrupted row cannot exhaust memory. */
const MAX_COST = COST;
const MAX_BLOCK_SIZE = BLOCK_SIZE;
const MAX_PARALLELISM = 16;
const MIN_KEY_LENGTH = 16;
const MAX_KEY_LENGTH = 128;
const HASH_FIELD_COUNT = 6;

export type DeriveKey = (
  password: BinaryLike,
  salt: BinaryLike,
  keyLength: number,
  options: ScryptOptions,
) => Promise<Buffer>;

export interface ScryptPasswordHasherOptions {
  /** Injected in tests to observe the computations. */
  deriveKey?: DeriveKey;
}

interface ParsedHash {
  cost: number;
  blockSize: number;
  parallelism: number;
  salt: Buffer;
  key: Buffer;
}

const defaultDeriveKey = promisify<BinaryLike, BinaryLike, number, ScryptOptions, Buffer>(scrypt);

const isPowerOfTwo = (value: number): boolean => (value & (value - 1)) === 0;

const parsePositiveInteger = (raw: string | undefined, max: number): number | null => {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= max ? value : null;
};

const parseHash = (stored: string): ParsedHash | null => {
  const fields = stored.split('$');
  if (fields.length !== HASH_FIELD_COUNT || fields[0] !== ALGORITHM) return null;
  const [, rawCost, rawBlockSize, rawParallelism, rawSalt, rawKey] = fields;
  const cost = parsePositiveInteger(rawCost, MAX_COST);
  const blockSize = parsePositiveInteger(rawBlockSize, MAX_BLOCK_SIZE);
  const parallelism = parsePositiveInteger(rawParallelism, MAX_PARALLELISM);
  if (cost === null || blockSize === null || parallelism === null) return null;
  if (cost < 2 || !isPowerOfTwo(cost)) return null;
  const salt = Buffer.from(rawSalt ?? '', 'base64');
  const key = Buffer.from(rawKey ?? '', 'base64');
  if (salt.length === 0 || key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) return null;
  return { cost, blockSize, parallelism, salt, key };
};

export class ScryptPasswordHasher implements PasswordHasher {
  private readonly deriveKey: DeriveKey;
  /** Computed once at start-up so that unknown e-mails cost as much as known ones. */
  private readonly dummyHash: Promise<string>;

  constructor(options: ScryptPasswordHasherOptions = {}) {
    this.deriveKey = options.deriveKey ?? defaultDeriveKey;
    this.dummyHash = this.hash(DUMMY_PASSWORD);
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await this.deriveKey(password, salt, KEY_LENGTH, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELISM,
      maxmem: MAX_MEMORY_BYTES,
    });
    const parameters = [COST, BLOCK_SIZE, PARALLELISM].join('$');
    return `${ALGORITHM}$${parameters}$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const parsed = parseHash(storedHash);
    if (parsed === null) return false;
    try {
      const candidate = await this.deriveKey(password, parsed.salt, parsed.key.length, {
        N: parsed.cost,
        r: parsed.blockSize,
        p: parsed.parallelism,
        maxmem: MAX_MEMORY_BYTES,
      });
      return candidate.length === parsed.key.length && timingSafeEqual(candidate, parsed.key);
    } catch {
      return false;
    }
  }

  async verifyDummy(password: string): Promise<boolean> {
    await this.verify(password, await this.dummyHash);
    return false;
  }
}
