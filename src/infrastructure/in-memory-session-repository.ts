import type { SessionRepository } from '../application/ports/session-repository.js';
import type { Session } from '../domain/session.js';
import { hashToken } from './hash-token.js';

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, Session>();

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
    this.sessions.set(session.idHash, session);
    return Promise.resolve(session);
  }

  findValid(id: string, now: Date): Promise<Session | null> {
    const session = this.sessions.get(hashToken(id));
    return Promise.resolve(session && session.expiresAt > now ? session : null);
  }

  delete(id: string): Promise<void> {
    this.sessions.delete(hashToken(id));
    return Promise.resolve();
  }

  deleteAllForUser(userId: string): Promise<void> {
    this.eraseWhere((session) => session.userId === userId);
    return Promise.resolve();
  }

  deleteExpired(now: Date): Promise<number> {
    return Promise.resolve(this.eraseWhere((session) => session.expiresAt <= now));
  }

  private eraseWhere(matches: (session: Session) => boolean): number {
    const doomed = [...this.sessions.values()].filter(matches);
    for (const { idHash } of doomed) this.sessions.delete(idHash);
    return doomed.length;
  }
}
