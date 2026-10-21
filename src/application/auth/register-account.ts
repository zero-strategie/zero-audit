import { EmailAlreadyRegistered, MailerUnavailable } from '../../domain/errors.js';
import { assertValidPassword } from '../../domain/password-policy.js';
import { normalizeEmail, type User } from '../../domain/user.js';
import type { Clock } from '../ports/clock.js';
import type { Mailer } from '../ports/mailer.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { SendVerificationLink } from './send-verification-link.js';

export interface RegisterAccountDependencies {
  readonly users: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly mailer: Mailer;
  readonly clock: Clock;
  readonly sendVerificationLink: SendVerificationLink;
}

export interface RegisterAccountInput {
  readonly email: string;
  readonly password: string;
  /** Honeypot: humans never see it, so a filled value means a bot. */
  readonly website?: string;
}

/**
 * Answers the same way for every valid request (new, verified or unverified address) so that the
 * response never reveals whether an account exists.
 */
export class RegisterAccount {
  constructor(private readonly dependencies: RegisterAccountDependencies) {}

  async execute({ email, password, website }: RegisterAccountInput): Promise<void> {
    const { users, passwordHasher, mailer, clock, sendVerificationLink } = this.dependencies;
    if (!mailer.enabled) throw new MailerUnavailable();
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
