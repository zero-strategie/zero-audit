import {
  LOGIN_FAILURES_PER_ACCOUNT,
  LOGIN_FAILURES_PER_IP,
  LOGIN_WINDOW_MS,
} from '../../domain/abuse-limits.js';
import {
  EmailNotVerified,
  InvalidEmail,
  TooManyAttempts,
  Unauthenticated,
} from '../../domain/errors.js';
import { normalizeEmail, type User } from '../../domain/user.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { RateLimiter } from '../ports/rate-limiter.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { OpenSession } from './open-session.js';

export interface LoginDependencies {
  readonly users: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly openSession: OpenSession;
  readonly rateLimiter: RateLimiter;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  /** Address of the client, the key of the per-address limit. */
  readonly ip: string;
}

export class Login {
  constructor(private readonly dependencies: LoginDependencies) {}

  /**
   * Returns a new session identifier. Unknown address and wrong password are indistinguishable, and
   * both count as a failure. The limits are checked before hashing so that a flood stays cheap.
   */
  async execute({ email, password, ip }: LoginInput): Promise<string> {
    const { passwordHasher, openSession, rateLimiter } = this.dependencies;
    const ipKey = `login-ip:${ip}`;
    const accountKey = `login-account:${email.trim().toLowerCase()}`;
    if (
      rateLimiter.isBlocked(ipKey, LOGIN_FAILURES_PER_IP, LOGIN_WINDOW_MS) ||
      rateLimiter.isBlocked(accountKey, LOGIN_FAILURES_PER_ACCOUNT, LOGIN_WINDOW_MS)
    ) {
      throw new TooManyAttempts();
    }
    const user = await this.findAccount(email);
    const authentic = user
      ? await passwordHasher.verify(password, user.passwordHash)
      : await passwordHasher.verifyDummy(password);
    if (!user || !authentic) {
      rateLimiter.hit(ipKey, LOGIN_WINDOW_MS);
      rateLimiter.hit(accountKey, LOGIN_WINDOW_MS);
      throw new Unauthenticated();
    }
    if (!user.verifiedAt) throw new EmailNotVerified();
    return openSession.execute(user.id);
  }

  private async findAccount(email: string): Promise<User | null> {
    try {
      return await this.dependencies.users.findByEmail(normalizeEmail(email));
    } catch (error) {
      if (error instanceof InvalidEmail) return null;
      throw error;
    }
  }
}
