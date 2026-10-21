import { EMAIL_LINKS_PER_HOUR, HOUR_MS } from '../../domain/abuse-limits.js';
import { VERIFY_TTL_MS } from '../../domain/email-token.js';
import type { User } from '../../domain/user.js';
import { buildVerificationLink } from '../emails/index.js';
import type { Clock } from '../ports/clock.js';
import type { EmailTokenRepository } from '../ports/email-token-repository.js';
import type { Mailer } from '../ports/mailer.js';
import type { TokenGenerator } from '../ports/token-generator.js';

export interface SendVerificationLinkDependencies {
  readonly emailTokens: EmailTokenRepository;
  readonly mailer: Mailer;
  readonly tokenGenerator: TokenGenerator;
  readonly clock: Clock;
  readonly publicUrl: string;
}

/** Issues a verification token and mails its link, unless the address already received 3 links this hour. */
export class SendVerificationLink {
  constructor(private readonly dependencies: SendVerificationLinkDependencies) {}

  async execute(user: User): Promise<void> {
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
      kind: 'verify',
      createdAt: now,
      expiresAt: new Date(now.getTime() + VERIFY_TTL_MS),
    });
    await mailer.sendVerification(user.email, buildVerificationLink(publicUrl, token));
  }
}
