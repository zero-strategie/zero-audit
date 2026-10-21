import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { EmailTokenRepository } from '../../application/ports/email-token-repository.js';
import type { EmailToken, EmailTokenKind } from '../../domain/email-token.js';
import { hashToken } from '../hash-token.js';

interface EmailTokenRow {
  token_hash: string;
  user_id: string;
  email: string;
  kind: EmailTokenKind;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

const toEmailToken = (row: EmailTokenRow): EmailToken => ({
  tokenHash: row.token_hash,
  userId: row.user_id,
  email: row.email,
  kind: row.kind,
  expiresAt: new Date(row.expires_at),
  usedAt: row.used_at === null ? null : new Date(row.used_at),
  createdAt: new Date(row.created_at),
});

export class SqliteEmailTokenRepository implements EmailTokenRepository {
  constructor(private readonly db: SqliteDatabase) {}

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
    this.db
      .prepare(
        `INSERT INTO email_tokens (token_hash, user_id, email, kind, expires_at, used_at, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      )
      .run(
        stored.tokenHash,
        stored.userId,
        stored.email,
        stored.kind,
        stored.expiresAt.toISOString(),
        stored.createdAt.toISOString(),
      );
    return Promise.resolve(stored);
  }

  consume(token: string, kind: EmailTokenKind, now: Date): Promise<EmailToken | null> {
    const row = this.db
      .prepare(
        `UPDATE email_tokens SET used_at = ?
         WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ?
         RETURNING *`,
      )
      .get(now.toISOString(), hashToken(token), kind, now.toISOString()) as
      EmailTokenRow | undefined;
    return Promise.resolve(row ? toEmailToken(row) : null);
  }

  countCreatedSince(email: string, since: Date): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM email_tokens WHERE email = ? AND created_at >= ?')
      .get(email, since.toISOString()) as { n: number };
    return Promise.resolve(row.n);
  }

  deleteExpired(now: Date): Promise<number> {
    const { changes } = this.db
      .prepare('DELETE FROM email_tokens WHERE expires_at <= ?')
      .run(now.toISOString());
    return Promise.resolve(changes);
  }
}
