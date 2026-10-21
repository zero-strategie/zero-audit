import type { Mailer } from '../../application/ports/mailer.js';

/** Development only: it is the one adapter that writes single-use links to the output. */
export class ConsoleMailer implements Mailer {
  constructor(private readonly write: (text: string) => void) {}

  sendVerification(_to: string, link: string): Promise<void> {
    this.write(`[mailer console] verification link: ${link}\n`);
    return Promise.resolve();
  }

  sendPasswordReset(_to: string, link: string): Promise<void> {
    this.write(`[mailer console] password reset link: ${link}\n`);
    return Promise.resolve();
  }
}
