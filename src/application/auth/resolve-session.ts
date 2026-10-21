import type { User } from '../../domain/user.js';
import type { Clock } from '../ports/clock.js';
import type { SessionRepository } from '../ports/session-repository.js';
import type { UserRepository } from '../ports/user-repository.js';

export interface ResolveSessionDependencies {
  readonly sessions: SessionRepository;
  readonly users: UserRepository;
  readonly clock: Clock;
}

/** Turns the `X-Session-Id` header into its owner, or null when there is no valid session. */
export class ResolveSession {
  constructor(private readonly dependencies: ResolveSessionDependencies) {}

  async execute(sessionId: string | undefined): Promise<User | null> {
    if (!sessionId) return null;
    const { sessions, users, clock } = this.dependencies;
    const session = await sessions.findValid(sessionId, new Date(clock.now()));
    return session ? users.findById(session.userId) : null;
  }
}
