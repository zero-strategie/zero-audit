import type { Session } from '../../domain/session.js';

/** Methods take the raw identifier held by the browser; only its SHA-256 is ever stored. */
export interface SessionRepository {
  create(input: { id: string; userId: string; createdAt: Date; expiresAt: Date }): Promise<Session>;
  /** Null when the session is unknown or `expiresAt` is not after `now`. */
  findValid(id: string, now: Date): Promise<Session | null>;
  delete(id: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
  deleteExpired(now: Date): Promise<number>;
}
