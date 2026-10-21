import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { passwordResetEmail } from '../../../src/application/emails/index.js';
import { MailDeliveryFailed } from '../../../src/domain/errors.js';
import { BrevoMailer } from '../../../src/infrastructure/mail/brevo-mailer.js';

const API_KEY = 'xkeysib-secret-api-key';
const FROM = 'no-reply@agents.zero-strategie.dev';
const TOKEN = 'secret-token-123';
const PUBLIC_URL = 'https://audit.exemple.test';

interface Received {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingMessage['headers'];
  body: Record<string, unknown>;
}

describe('BrevoMailer', () => {
  let server: Server | undefined;
  const received: Received[] = [];

  const start = async (handler: (respond: (status: number) => void) => void): Promise<string> => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        received.push({
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>,
        });
        handler((status) => {
          response.writeHead(status).end('{}');
        });
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  };

  afterEach(async () => {
    received.length = 0;
    await new Promise<void>((resolve) => {
      if (server === undefined) resolve();
      else
        server.close(() => {
          resolve();
        });
      server?.closeAllConnections();
    });
    server = undefined;
  });

  const mailer = (baseUrl: string, logs: string[] = [], timeoutMs = 2000): BrevoMailer =>
    new BrevoMailer({
      baseUrl,
      apiKey: API_KEY,
      from: FROM,
      timeoutMs,
      logger: {
        info: (message) => logs.push(message),
        error: (message) => logs.push(message),
      },
    });

  it('posts the verification e-mail to /v3/smtp/email with the api-key header', async () => {
    const baseUrl = await start((respond) => {
      respond(201);
    });
    const link = `${PUBLIC_URL}/verifier-email?token=${TOKEN}`;

    await mailer(baseUrl).sendVerification('alice@exemple.test', link);

    const [request] = received;
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe('/v3/smtp/email');
    expect(request?.headers['api-key']).toBe(API_KEY);
    expect(request?.body).toMatchObject({
      sender: { email: FROM },
      to: [{ email: 'alice@exemple.test' }],
      subject: 'Confirmez votre adresse',
    });
    expect(request?.body['htmlContent']).toContain(link);
    expect(request?.body['textContent']).toContain(link);
  });

  it('sends the reset e-mail with the reset link', async () => {
    const baseUrl = await start((respond) => {
      respond(201);
    });
    const link = `${PUBLIC_URL}/reinitialiser?token=${TOKEN}`;

    await mailer(baseUrl).sendPasswordReset('alice@exemple.test', link);

    expect(received[0]?.body['subject']).toBe(passwordResetEmail(link).subject);
    expect(received[0]?.body['textContent']).toContain(link);
  });

  it('raises MailDeliveryFailed on a 500 without leaking token, link or key', async () => {
    const baseUrl = await start((respond) => {
      respond(500);
    });
    const logs: string[] = [];
    const link = `${PUBLIC_URL}/verifier-email?token=${TOKEN}`;

    const failure = await mailer(baseUrl, logs)
      .sendVerification('alice@exemple.test', link)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MailDeliveryFailed);
    const everything = [...logs, (failure as Error).message].join('\n');
    expect(logs.length).toBeGreaterThan(0);
    for (const secret of [TOKEN, link, API_KEY]) expect(everything).not.toContain(secret);
  });

  it('raises MailDeliveryFailed when Brevo does not answer before the timeout', async () => {
    const baseUrl = await start(() => undefined);
    const logs: string[] = [];

    const failure = await mailer(baseUrl, logs, 100)
      .sendVerification('alice@exemple.test', `${PUBLIC_URL}/verifier-email?token=${TOKEN}`)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MailDeliveryFailed);
    expect([...logs, (failure as Error).message].join('\n')).not.toContain(TOKEN);
  });
});
