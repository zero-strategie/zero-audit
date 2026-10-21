export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

export type EmailTokenKind = 'verify' | 'reset';

export interface EmailToken {
  /** SHA-256 of the token sent by e-mail; the token itself is never stored. */
  readonly tokenHash: string;
  readonly userId: string;
  readonly email: string;
  readonly kind: EmailTokenKind;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly createdAt: Date;
}
