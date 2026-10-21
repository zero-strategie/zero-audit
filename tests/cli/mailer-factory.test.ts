import { describe, expect, it } from 'vitest';
import { MailerUnavailable } from '../../src/domain/errors.js';
import { createMailer } from '../../src/cli/mailer-factory.js';
import { BrevoMailer } from '../../src/infrastructure/mail/brevo-mailer.js';

const FROM = 'no-reply@agents.zero-strategie.dev';
const logger = { info: () => undefined, error: () => undefined };

describe('createMailer', () => {
  it('builds a disabled mailer that refuses to send', async () => {
    const mailer = createMailer(
      { kind: 'disabled', from: FROM, publicUrl: null },
      logger,
      () => undefined,
    );

    await expect(mailer.sendVerification('a@exemple.test', 'l')).rejects.toThrow(MailerUnavailable);
  });

  it('builds a console mailer writing the link to the output', async () => {
    const lines: string[] = [];
    const mailer = createMailer({ kind: 'console', from: FROM, publicUrl: null }, logger, (t) =>
      lines.push(t),
    );

    await mailer.sendPasswordReset('a@exemple.test', 'https://x.test/reinitialiser?token=t');

    expect(lines.join('')).toContain('https://x.test/reinitialiser?token=t');
  });

  it('builds a Brevo mailer', () => {
    const config = { kind: 'brevo', from: FROM, publicUrl: 'https://x.test', apiKey: 'k' } as const;

    expect(createMailer(config, logger, () => undefined)).toBeInstanceOf(BrevoMailer);
  });
});
