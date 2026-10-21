import { HOUR_MS, REGISTRATIONS_PER_IP_PER_HOUR } from '../../domain/abuse-limits.js';
import { EmailAlreadyRegistered, MailerUnavailable, TooManyAttempts } from '../../domain/errors.js';
import { assertValidPassword } from '../../domain/password-policy.js';
import { normalizeEmail, type User } from '../../domain/user.js';
import type { Clock } from '../ports/clock.js';
import type { Mailer } from '../ports/mailer.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { RateLimiter } from '../ports/rate-limiter.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { SendVerificationLink } from './send-verification-link.js';

export interface RegisterAccountDependencies {
  readonly users: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly mailer: Mailer;
  readonly clock: Clock;
  readonly sendVerificationLink: SendVerificationLink;
  readonly rateLimiter: RateLimiter;
}

export interface RegisterAccountInput {
  readonly email: string;
  readonly password: string;
  /** Honeypot: humans never see it, so a filled value means a bot. */
  readonly website?: string;
  /** Address of the client, the key of the per-address limit. */
  readonly ip: string;
}

/**
 * Answers the same way for every valid request (new, verified or unverified address) so that the
 * response never reveals whether an account exists.
 */
export class RegisterAccount {
  constructor(private readonly dependencies: RegisterAccountDependencies) {}

  async execute({ email, password, website, ip }: RegisterAccountInput): Promise<void> {
    const { users, passwordHasher, mailer, clock, sendVerificationLink, rateLimiter } =
      this.dependencies;
    if (!mailer.enabled) throw new MailerUnavailable();
    const ipKey = `register-ip:${ip}`;
    if (rateLimiter.isBlocked(ipKey, REGISTRATIONS_PER_IP_PER_HOUR, HOUR_MS)) {
      throw new TooManyAttempts();
    }
    rateLimiter.hit(ipKey, HOUR_MS);
    const normalized = normalizeEmail(email);
    assertValidPassword(password);
    if (website) return;
    // Hashed for every address so that the response time does not reveal an existing account.
    const passwordHash = await passwordHasher.hash(password);
    const existing = await users.findByEmail(normalized);
    if (existing?.verifiedAt) return;
    const user = existing
      ? await this.replacePassword(existing, passwordHash)
      : await this.createAccount(normalized, passwordHash, new Date(clock.now()));
    if (user) await sendVerificationLink.execute(user);
  }

  private async replacePassword(user: User, passwordHash: string): Promise<User> {
    await this.dependencies.users.updatePasswordHash(user.id, passwordHash);
    return { ...user, passwordHash };
  }

  private async createAccount(
    email: string,
    passwordHash: string,
    createdAt: Date,
  ): Promise<User | null> {
    try {
      return await this.dependencies.users.create({ email, passwordHash, createdAt });
    } catch (error) {
      if (error instanceof EmailAlreadyRegistered) return null;
      throw error;
    }
  }
}
