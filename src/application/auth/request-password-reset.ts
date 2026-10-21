import { EMAIL_LINKS_PER_HOUR, HOUR_MS } from '../../domain/abuse-limits.js';
import { RESET_TTL_MS } from '../../domain/email-token.js';
import { InvalidEmail, MailerUnavailable } from '../../domain/errors.js';
import { normalizeEmail, type User } from '../../domain/user.js';
import { buildPasswordResetLink } from '../emails/index.js';
import type { Clock } from '../ports/clock.js';
import type { EmailTokenRepository } from '../ports/email-token-repository.js';
import type { Mailer } from '../ports/mailer.js';
import type { TokenGenerator } from '../ports/token-generator.js';
import type { UserRepository } from '../ports/user-repository.js';

export interface RequestPasswordResetDependencies {
  readonly users: UserRepository;
  readonly emailTokens: EmailTokenRepository;
  readonly mailer: Mailer;
  readonly tokenGenerator: TokenGenerator;
  readonly clock: Clock;
  readonly publicUrl: string;
}

/** Never reveals whether the address has an account: only a verified one receives a link. */
export class RequestPasswordReset {
  constructor(private readonly dependencies: RequestPasswordResetDependencies) {}

  async execute({ email }: { email: string }): Promise<void> {
    const { users, mailer } = this.dependencies;
    if (!mailer.enabled) throw new MailerUnavailable();
    const user = await users.findByEmail(this.normalize(email));
    if (user?.verifiedAt) await this.sendLink(user);
  }

  private async sendLink(user: User): Promise<void> {
    const { emailTokens, mailer, tokenGenerator, clock, publicUrl } = this.dependencies;
    const now = new Date(clock.now());
    const recent = await emailTokens.countCreatedSince(
      user.email,
      new Date(now.getTime() - HOUR_MS),
    );
    if (recent >= EMAIL_LINKS_PER_HOUR) return;
    const token = tokenGenerator.generate();
    await emailTokens.create({
      token,
      userId: user.id,
      email: user.email,
      kind: 'reset',
      createdAt: now,
      expiresAt: new Date(now.getTime() + RESET_TTL_MS),
    });
    await mailer.sendPasswordReset(user.email, buildPasswordResetLink(publicUrl, token));
  }

  private normalize(email: string): string {
    try {
      return normalizeEmail(email);
    } catch (error) {
      if (error instanceof InvalidEmail) return '';
      throw error;
    }
  }
}
