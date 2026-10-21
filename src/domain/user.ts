import { InvalidEmail } from './errors.js';

export interface User {
  readonly id: string;
  /** Normalized with `normalizeEmail`. */
  readonly email: string;
  readonly passwordHash: string;
  /** Null until the owner of the address has followed the verification link. */
  readonly verifiedAt: Date | null;
  readonly createdAt: Date;
}

export const MAX_EMAIL_LENGTH = 254;

/** Trim and lowercase only: no provider-specific rule (no dot or plus-tag folding). */
export const normalizeEmail = (raw: string): string => {
  const email = raw.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !email.includes('@')) throw new InvalidEmail();
  return email;
};

/** An account whose address is still unverified after this long is erased by the purge. */
export const UNVERIFIED_ACCOUNT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
