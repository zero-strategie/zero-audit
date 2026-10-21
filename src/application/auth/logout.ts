import { Unauthenticated } from '../../domain/errors.js';
import type { SessionRepository } from '../ports/session-repository.js';
import type { ResolveSession } from './resolve-session.js';

export interface LogoutDependencies {
  readonly resolveSession: ResolveSession;
  readonly sessions: SessionRepository;
}

export class Logout {
  constructor(private readonly dependencies: LogoutDependencies) {}

  /** Ends the given session only; the account keeps its other sessions. */
  async execute(sessionId: string | undefined): Promise<void> {
    const { resolveSession, sessions } = this.dependencies;
    if (!sessionId || !(await resolveSession.execute(sessionId))) throw new Unauthenticated();
    await sessions.delete(sessionId);
  }
}
