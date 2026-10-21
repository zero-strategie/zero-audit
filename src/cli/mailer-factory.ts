import type { Logger } from '../application/ports/logger.js';
import type { Mailer } from '../application/ports/mailer.js';
import { BrevoMailer } from '../infrastructure/mail/brevo-mailer.js';
import { ConsoleMailer } from '../infrastructure/mail/console-mailer.js';
import { DisabledMailer } from '../infrastructure/mail/disabled-mailer.js';
import type { MailConfig } from './config.js';

export const CONSOLE_MAILER_WARNING = 'mailer console : interdit en production';

export const createMailer = (
  config: MailConfig,
  logger: Logger,
  write: (text: string) => void,
): Mailer => {
  if (config.kind === 'console') return new ConsoleMailer(write);
  if (config.kind === 'brevo') {
    return new BrevoMailer({ apiKey: config.apiKey, from: config.from, logger });
  }
  return new DisabledMailer();
};
