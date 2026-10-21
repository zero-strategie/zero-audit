import type { Mailer } from '../../application/ports/mailer.js';
import { MailerUnavailable } from '../../domain/errors.js';

/** Default when no mailer is configured: sign-up and resets answer 503 instead of dropping e-mails. */
export class DisabledMailer implements Mailer {
  sendVerification(): Promise<void> {
    return Promise.reject(new MailerUnavailable());
  }

  sendPasswordReset(): Promise<void> {
    return Promise.reject(new MailerUnavailable());
  }
}
