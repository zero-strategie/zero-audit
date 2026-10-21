import { InvalidOrExpiredToken } from '../../domain/errors.js';
import { assertValidPassword } from '../../domain/password-policy.js';
import type { Clock } from '../ports/clock.js';
import type { EmailTokenRepository } from '../ports/email-token-repository.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { SessionRepository } from '../ports/session-repository.js';
import type { UserRepository } from '../ports/user-repository.js';

export interface ConfirmPasswordResetDependencies {
  readonly users: UserRepository;
  readonly emailTokens: EmailTokenRepository;
  readonly sessions: SessionRepository;
  readonly passwordHasher: PasswordHasher;
  readonly clock: Clock;
}

export class ConfirmPasswordReset {
  constructor(private readonly dependencies: ConfirmPasswordResetDependencies) {}

  /**
   * Consumes the reset token, replaces the password and ends every session of the account, so that
   * whoever held the old password is signed out. The user must log in again.
   */
  async execute({ token, password }: { token: string; password: string }): Promise<void> {
    const { users, emailTokens, sessions, passwordHasher, clock } = this.dependencies;
    assertValidPassword(password);
    const consumed = await emailTokens.consume(token, 'reset', new Date(clock.now()));
    if (!consumed) throw new InvalidOrExpiredToken();
    const user = await users.findById(consumed.userId);
    if (!user) throw new InvalidOrExpiredToken();
    await users.updatePasswordHash(user.id, await passwordHasher.hash(password));
    await sessions.deleteAllForUser(user.id);
  }
}
