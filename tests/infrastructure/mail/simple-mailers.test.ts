import type { Mailer } from '../../../src/application/ports/mailer.js';
import { describe, expect, it } from 'vitest';
import { MailerUnavailable } from '../../../src/domain/errors.js';
import { ConsoleMailer } from '../../../src/infrastructure/mail/console-mailer.js';
import { DisabledMailer } from '../../../src/infrastructure/mail/disabled-mailer.js';

const LINK = 'https://audit.exemple.test/verifier-email?token=abc';

describe('DisabledMailer', () => {
  it('raises MailerUnavailable for every e-mail', async () => {
    const mailer: Mailer = new DisabledMailer();

    await expect(mailer.sendVerification('a@exemple.test', LINK)).rejects.toThrow(
      MailerUnavailable,
    );
    await expect(mailer.sendPasswordReset('a@exemple.test', LINK)).rejects.toThrow(
      MailerUnavailable,
    );
  });
});

describe('Mailer.enabled', () => {
  it('is false for the disabled mailer and true for the console mailer', () => {
    expect(new DisabledMailer().enabled).toBe(false);
    expect(new ConsoleMailer(() => undefined).enabled).toBe(true);
  });
});

describe('ConsoleMailer', () => {
  it('writes the link on the output', async () => {
    const lines: string[] = [];
    const mailer = new ConsoleMailer((text) => lines.push(text));

    await mailer.sendVerification('a@exemple.test', LINK);
    await mailer.sendPasswordReset('a@exemple.test', `${LINK}2`);

    expect(lines.join('')).toContain(LINK);
    expect(lines.join('')).toContain(`${LINK}2`);
  });
});
