import { InvalidEmail, MailerUnavailable } from '../../domain/errors.js';
import { normalizeEmail } from '../../domain/user.js';
import type { Mailer } from '../ports/mailer.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { SendVerificationLink } from './send-verification-link.js';

export interface ResendVerificationDependencies {
  readonly users: UserRepository;
  readonly mailer: Mailer;
  readonly sendVerificationLink: SendVerificationLink;
}

/** Never reveals whether the address has an account: it only mails an unverified one. */
export class ResendVerification {
  constructor(private readonly dependencies: ResendVerificationDependencies) {}

  async execute({ email }: { email: string }): Promise<void> {
    const { users, mailer, sendVerificationLink } = this.dependencies;
    if (!mailer.enabled) throw new MailerUnavailable();
    const user = await users.findByEmail(this.normalize(email));
    if (user && !user.verifiedAt) await sendVerificationLink.execute(user);
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
