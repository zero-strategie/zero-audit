import type { EmailTokenRepository } from '../application/ports/email-token-repository.js';
import type { EmailToken, EmailTokenKind } from '../domain/email-token.js';
import { hashToken } from './hash-token.js';

export class InMemoryEmailTokenRepository implements EmailTokenRepository {
  private readonly tokens = new Map<string, EmailToken>();

  create(input: {
    token: string;
    userId: string;
    email: string;
    kind: EmailTokenKind;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<EmailToken> {
    const { token, ...fields } = input;
    const stored: EmailToken = { tokenHash: hashToken(token), usedAt: null, ...fields };
    this.tokens.set(stored.tokenHash, stored);
    return Promise.resolve(stored);
  }

  consume(token: string, kind: EmailTokenKind, now: Date): Promise<EmailToken | null> {
    const tokenHash = hashToken(token);
    const stored = this.tokens.get(tokenHash);
    if (!stored || stored.kind !== kind || stored.usedAt !== null || stored.expiresAt <= now) {
      return Promise.resolve(null);
    }
    const used: EmailToken = { ...stored, usedAt: now };
    this.tokens.set(tokenHash, used);
    return Promise.resolve(used);
  }

  countCreatedSince(email: string, since: Date): Promise<number> {
    const created = [...this.tokens.values()].filter(
      (token) => token.email === email && token.createdAt >= since,
    );
    return Promise.resolve(created.length);
  }

  /** For `InMemoryAccountEraser` only. */
  eraseForUser(userId: string): void {
    for (const token of [...this.tokens.values()]) {
      if (token.userId === userId) this.tokens.delete(token.tokenHash);
    }
  }

  deleteExpired(now: Date): Promise<number> {
    const doomed = [...this.tokens.values()].filter((token) => token.expiresAt <= now);
    for (const { tokenHash } of doomed) this.tokens.delete(tokenHash);
    return Promise.resolve(doomed.length);
  }
}
