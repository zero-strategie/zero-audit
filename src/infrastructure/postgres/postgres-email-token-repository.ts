import type pg from 'pg';
import type { EmailTokenRepository } from '../../application/ports/email-token-repository.js';
import type { EmailToken, EmailTokenKind } from '../../domain/email-token.js';
import { hashToken } from '../hash-token.js';

type EmailTokenRow = {
  token_hash: string;
  user_id: string;
  email: string;
  kind: EmailTokenKind;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
};

const toEmailToken = (row: EmailTokenRow): EmailToken => ({
  tokenHash: row.token_hash,
  userId: row.user_id,
  email: row.email,
  kind: row.kind,
  expiresAt: row.expires_at,
  usedAt: row.used_at,
  createdAt: row.created_at,
});

export class PostgresEmailTokenRepository implements EmailTokenRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: {
    token: string;
    userId: string;
    email: string;
    kind: EmailTokenKind;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<EmailToken> {
    const { token, ...fields } = input;
    const stored: EmailToken = { tokenHash: hashToken(token), usedAt: null, ...fields };
    await this.pool.query(
      `INSERT INTO email_tokens (token_hash, user_id, email, kind, expires_at, used_at, created_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6)`,
      [
        stored.tokenHash,
        stored.userId,
        stored.email,
        stored.kind,
        stored.expiresAt,
        stored.createdAt,
      ],
    );
    return stored;
  }

  async consume(token: string, kind: EmailTokenKind, now: Date): Promise<EmailToken | null> {
    const { rows } = await this.pool.query<EmailTokenRow>(
      `UPDATE email_tokens SET used_at = $1
       WHERE token_hash = $2 AND kind = $3 AND used_at IS NULL AND expires_at > $1
       RETURNING *`,
      [now, hashToken(token), kind],
    );
    return rows[0] ? toEmailToken(rows[0]) : null;
  }

  async countCreatedSince(email: string, since: Date): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      'SELECT COUNT(*) AS n FROM email_tokens WHERE email = $1 AND created_at >= $2',
      [email, since],
    );
    return Number(rows[0]?.n);
  }

  async deleteExpired(now: Date): Promise<number> {
    const result = await this.pool.query('DELETE FROM email_tokens WHERE expires_at <= $1', [now]);
    return result.rowCount ?? 0;
  }
}
