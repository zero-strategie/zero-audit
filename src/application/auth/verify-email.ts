import { InvalidOrExpiredToken } from '../../domain/errors.js';
import type { Clock } from '../ports/clock.js';
import type { EmailTokenRepository } from '../ports/email-token-repository.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { OpenSession } from './open-session.js';

export interface VerifyEmailDependencies {
  readonly users: UserRepository;
  readonly emailTokens: EmailTokenRepository;
  readonly clock: Clock;
  readonly openSession: OpenSession;
}

export class VerifyEmail {
  constructor(private readonly dependencies: VerifyEmailDependencies) {}

  /** Consumes the verification token, verifies the account and returns a new session identifier. */
  async execute(token: string): Promise<string> {
    const { users, emailTokens, clock, openSession } = this.dependencies;
    const now = new Date(clock.now());
    const consumed = await emailTokens.consume(token, 'verify', now);
    if (!consumed) throw new InvalidOrExpiredToken();
    const user = await users.findById(consumed.userId);
    if (!user) throw new InvalidOrExpiredToken();
    await users.markVerified(user.id, now);
    return openSession.execute(user.id);
  }
}
