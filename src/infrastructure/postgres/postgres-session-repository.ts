import type pg from 'pg';
import type { SessionRepository } from '../../application/ports/session-repository.js';
import type { Session } from '../../domain/session.js';
import { hashToken } from '../hash-token.js';

type SessionRow = {
  id_hash: string;
  user_id: string;
  expires_at: Date;
  created_at: Date;
};

const toSession = (row: SessionRow): Session => ({
  idHash: row.id_hash,
  userId: row.user_id,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
});

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: {
    id: string;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<Session> {
    const session: Session = {
      idHash: hashToken(input.id),
      userId: input.userId,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    };
    await this.pool.query(
      'INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)',
      [session.idHash, session.userId, session.expiresAt, session.createdAt],
    );
    return session;
  }

  async findValid(id: string, now: Date): Promise<Session | null> {
    const { rows } = await this.pool.query<SessionRow>(
      'SELECT * FROM sessions WHERE id_hash = $1 AND expires_at > $2',
      [hashToken(id), now],
    );
    return rows[0] ? toSession(rows[0]) : null;
  }

  async delete(id: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE id_hash = $1', [hashToken(id)]);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  }

  async deleteExpired(now: Date): Promise<number> {
    const result = await this.pool.query('DELETE FROM sessions WHERE expires_at <= $1', [now]);
    return result.rowCount ?? 0;
  }
}
