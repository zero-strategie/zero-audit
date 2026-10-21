import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { SessionRepository } from '../../application/ports/session-repository.js';
import type { Session } from '../../domain/session.js';
import { hashToken } from '../hash-token.js';

interface SessionRow {
  id_hash: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

const toSession = (row: SessionRow): Session => ({
  idHash: row.id_hash,
  userId: row.user_id,
  expiresAt: new Date(row.expires_at),
  createdAt: new Date(row.created_at),
});

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(input: {
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
    this.db
      .prepare(
        'INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(
        session.idHash,
        session.userId,
        session.expiresAt.toISOString(),
        session.createdAt.toISOString(),
      );
    return Promise.resolve(session);
  }

  findValid(id: string, now: Date): Promise<Session | null> {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id_hash = ? AND expires_at > ?')
      .get(hashToken(id), now.toISOString()) as SessionRow | undefined;
    return Promise.resolve(row ? toSession(row) : null);
  }

  delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hashToken(id));
    return Promise.resolve();
  }

  deleteAllForUser(userId: string): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    return Promise.resolve();
  }

  deleteExpired(now: Date): Promise<number> {
    const { changes } = this.db
      .prepare('DELETE FROM sessions WHERE expires_at <= ?')
      .run(now.toISOString());
    return Promise.resolve(changes);
  }
}
