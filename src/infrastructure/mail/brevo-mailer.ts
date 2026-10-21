import { fetch } from 'undici';
import { passwordResetEmail, verificationEmail } from '../../application/emails/index.js';
import type { Logger } from '../../application/ports/logger.js';
import type { EmailContent, Mailer } from '../../application/ports/mailer.js';
import { MailDeliveryFailed } from '../../domain/errors.js';

export const BREVO_API_URL = 'https://api.brevo.com';
const SEND_PATH = '/v3/smtp/email';
const DEFAULT_TIMEOUT_MS = 10_000;
const SENDER_NAME = 'Zero Audit';

export interface BrevoMailerOptions {
  apiKey: string;
  from: string;
  logger: Logger;
  /** Overridden in tests to target a local server. */
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Failures are reported by status or error name only: the request carries the recipient,
 * the single-use link and the API key, none of which may reach the logs.
 */
export class BrevoMailer implements Mailer {
  readonly enabled = true;

  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: BrevoMailerOptions) {
    this.endpoint = `${options.baseUrl ?? BREVO_API_URL}${SEND_PATH}`;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  sendVerification(to: string, link: string): Promise<void> {
    return this.send(to, verificationEmail(link));
  }

  sendPasswordReset(to: string, link: string): Promise<void> {
    return this.send(to, passwordResetEmail(link));
  }

  private async send(to: string, content: EmailContent): Promise<void> {
    const response = await this.post(to, content);
    if (!response.ok) {
      this.options.logger.error(`Brevo refused an e-mail (HTTP ${String(response.status)})`);
      throw new MailDeliveryFailed(`Brevo answered HTTP ${String(response.status)}`);
    }
  }

  private async post(to: string, content: EmailContent): Promise<{ ok: boolean; status: number }> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'api-key': this.options.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: this.options.from, name: SENDER_NAME },
          to: [{ email: to }],
          subject: content.subject,
          htmlContent: content.html,
          textContent: content.text,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      await response.body?.cancel();
      return response;
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'unknown error';
      this.options.logger.error(`Brevo could not be reached (${kind})`);
      throw new MailDeliveryFailed('Brevo could not be reached');
    }
  }
}
