import { describe, expect, it } from 'vitest';
import { VERIFY_TTL_MS } from '../../src/domain/email-token.js';
import { NOW } from '../support/auth-doubles.js';
import {
  buildAuthServer,
  GENERIC_REGISTER_MESSAGE,
  PASSWORD,
  seedAccount,
} from './auth-support.js';

const register = { email: 'alice@exemple.test', password: PASSWORD };

describe('POST /auth/register', () => {
  it('answers 202 with the generic message, creates an unverified account and mails the raw token', async () => {
    const { post, kit } = buildAuthServer();

    const response = await post('/auth/register', register);

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ message: GENERIC_REGISTER_MESSAGE });
    expect(await kit.users.findByEmail('alice@exemple.test')).toMatchObject({ verifiedAt: null });
    expect(kit.mailer.tokenOfLink(0)).toBe('token-1');
    const stored = await kit.emailTokens.consume('token-1', 'verify', NOW);
    expect(stored?.expiresAt).toEqual(new Date(NOW.getTime() + VERIFY_TTL_MS));
  });

  it('answers the same 202 for a verified address and sends nothing', async () => {
    const { post, kit } = buildAuthServer();
    await seedAccount(kit, { verified: true });

    const response = await post('/auth/register', register);

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ message: GENERIC_REGISTER_MESSAGE });
    expect(kit.mailer.sent).toEqual([]);
  });

  it('replaces the password of an unverified address, then stops after 3 links in the hour', async () => {
    const { post, kit } = buildAuthServer();
    await seedAccount(kit, { verified: false });

    const responses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      responses.push(await post('/auth/register', { ...register, password: 'another password!' }));
    }

    expect(responses.map((response) => response.statusCode)).toEqual([202, 202, 202, 202]);
    expect(new Set(responses.map((response) => response.body)).size).toBe(1);
    expect((await kit.users.findByEmail('alice@exemple.test'))?.passwordHash).toBe(
      'hashed:another password!',
    );
    expect(kit.mailer.sent).toHaveLength(3);
  });

  it('answers 400 in French for an invalid address, without creating an account', async () => {
    const { post, kit } = buildAuthServer();

    const response = await post('/auth/register', { ...register, email: 'not-an-email' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'invalid_request', message: 'Adresse e-mail invalide' },
    });
    expect(kit.mailer.sent).toEqual([]);
  });

  it('answers 400 in French for a password of 11 characters, without creating an account', async () => {
    const { post, kit } = buildAuthServer();

    const response = await post('/auth/register', { ...register, password: 'elevenchars' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'invalid_request',
        message: 'Le mot de passe doit contenir entre 12 et 128 caractères',
      },
    });
    expect(await kit.users.findByEmail('alice@exemple.test')).toBeNull();
  });

  it('answers the generic 202 to a filled trap field, with no account and no e-mail', async () => {
    const { post, kit } = buildAuthServer();

    const response = await post('/auth/register', { ...register, website: 'https://spam.test' });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ message: GENERIC_REGISTER_MESSAGE });
    expect(await kit.users.findByEmail('alice@exemple.test')).toBeNull();
    expect(kit.mailer.sent).toEqual([]);
  });

  it('answers 503 when the mailer is disabled', async () => {
    const { post, kit } = buildAuthServer();
    kit.mailer.enabled = false;

    const response = await post('/auth/register', register);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: 'unavailable',
        message: 'Les inscriptions sont momentanément indisponibles',
      },
    });
  });
});

describe('POST /auth/resend-verification', () => {
  it('mails a link only to an unverified account, with the same 202 for everyone', async () => {
    const { post, kit } = buildAuthServer();
    await seedAccount(kit, { verified: false });
    await seedAccount(kit, { verified: true, email: 'bob@exemple.test' });

    const responses = [
      await post('/auth/resend-verification', { email: 'alice@exemple.test' }),
      await post('/auth/resend-verification', { email: 'bob@exemple.test' }),
      await post('/auth/resend-verification', { email: 'nobody@exemple.test' }),
    ];

    expect(responses.map((response) => response.statusCode)).toEqual([202, 202, 202]);
    expect(new Set(responses.map((response) => response.body)).size).toBe(1);
    expect(responses[0]?.json()).toEqual({ message: GENERIC_REGISTER_MESSAGE });
    expect(kit.mailer.sent.map((mail) => mail.to)).toEqual(['alice@exemple.test']);
  });

  it('answers 503 when the mailer is disabled', async () => {
    const { post, kit } = buildAuthServer();
    kit.mailer.enabled = false;

    const response = await post('/auth/resend-verification', { email: 'alice@exemple.test' });

    expect(response.statusCode).toBe(503);
  });
});
