import type { EmailToken, EmailTokenKind } from '../../domain/email-token.js';

/** Methods take the raw token sent by e-mail; only its SHA-256 is ever stored. */
export interface EmailTokenRepository {
  create(input: {
    token: string;
    userId: string;
    email: string;
    kind: EmailTokenKind;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<EmailToken>;
  /**
   * Marks the token as used and returns it. Null when it is unknown, of another kind, expired or
   * already used, so a token works once.
   */
  consume(token: string, kind: EmailTokenKind, now: Date): Promise<EmailToken | null>;
  /** Tokens of any kind created for the address at or after `since`. */
  countCreatedSince(email: string, since: Date): Promise<number>;
  deleteExpired(now: Date): Promise<number>;
}
