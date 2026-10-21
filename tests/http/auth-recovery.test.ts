import { describe, expect, it } from 'vitest';
import { RESET_TTL_MS, VERIFY_TTL_MS } from '../../src/domain/email-token.js';
import { NOW } from '../support/auth-doubles.js';
import {
  buildAuthServer,
  GENERIC_REGISTER_MESSAGE,
  PASSWORD,
  seedAccount,
} from './auth-support.js';

const credentials = { email: 'alice@exemple.test', password: PASSWORD };
const NEW_PASSWORD = 'a brand new password';
const INVALID_LINK = {
  error: { code: 'invalid_request', message: 'Ce lien est invalide ou a expiré' },
};

const seedResetToken = async (
  kit: ReturnType<typeof buildAuthServer>['kit'],
  userId: string,
  kind: 'reset' | 'verify' = 'reset',
) =>
  kit.emailTokens.create({
    token: 'raw-token',
    userId,
    email: credentials.email,
    kind,
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + (kind === 'reset' ? RESET_TTL_MS : VERIFY_TTL_MS)),
  });

describe('POST /auth/password-reset/request', () => {
  it('answers 202 and mails a link for a verified account, with the same answer for an unknown one', async () => {
    const { post, kit } = buildAuthServer();
    await seedAccount(kit, { verified: true });

    const known = await post('/auth/password-reset/request', { email: credentials.email });
    const sentAfterKnown = kit.mailer.sent.length;
    const unknown = await post('/auth/password-reset/request', { email: 'nobody@exemple.test' });

    expect(known.statusCode).toBe(202);
    expect(known.json()).toEqual({ message: GENERIC_REGISTER_MESSAGE });
    expect(sentAfterKnown).toBe(1);
    expect(kit.mailer.sent[0]?.link).toContain('/reinitialiser?token=');
    expect(unknown.statusCode).toBe(202);
    expect(unknown.body).toBe(known.body);
    expect(kit.mailer.sent).toHaveLength(1);
  });

  it('keeps answering 202 but sends nothing beyond 3 links in the hour', async () => {
    const { post, kit } = buildAuthServer();
    await seedAccount(kit, { verified: true });

    const statuses = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      statuses.push((await post('/auth/password-reset/request', credentials)).statusCode);
    }

    expect(statuses).toEqual([202, 202, 202, 202, 202]);
    expect(kit.mailer.sent).toHaveLength(3);
  });

  it('answers 503 when the mailer is disabled', async () => {
    const { post, kit } = buildAuthServer();
    kit.mailer.enabled = false;

    const response = await post('/auth/password-reset/request', credentials);

    expect(response.statusCode).toBe(503);
  });
});

describe('POST /auth/password-reset/confirm', () => {
  it('changes the password, ends all sessions and consumes the token', async () => {
    const { post, get, kit } = buildAuthServer();
    const user = await seedAccount(kit, { verified: true });
    const first = (await post('/auth/login', credentials)).json<{ sessionId: string }>();
    const second = (await post('/auth/login', credentials)).json<{ sessionId: string }>();
    await seedResetToken(kit, user.id);

    const response = await post('/auth/password-reset/confirm', {
      token: 'raw-token',
      password: NEW_PASSWORD,
    });

    expect(response.statusCode).toBe(204);
    for (const { sessionId } of [first, second]) {
      expect((await get('/auth/me', { 'x-session-id': sessionId })).statusCode).toBe(401);
    }
    expect((await post('/auth/login', credentials)).statusCode).toBe(401);
    expect(
      (await post('/auth/login', { email: credentials.email, password: NEW_PASSWORD })).statusCode,
    ).toBe(200);
    const replay = await post('/auth/password-reset/confirm', {
      token: 'raw-token',
      password: NEW_PASSWORD,
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toEqual(INVALID_LINK);
  });

  it('answers the same 400 for an expired or verification token, and changes nothing', async () => {
    const expired = buildAuthServer();
    const verification = buildAuthServer();
    const expiredUser = await seedAccount(expired.kit, { verified: true });
    const verificationUser = await seedAccount(verification.kit, { verified: true });
    await seedResetToken(expired.kit, expiredUser.id);
    await seedResetToken(verification.kit, verificationUser.id, 'verify');
    expired.kit.clock.advance(RESET_TTL_MS);
    const body = { token: 'raw-token', password: NEW_PASSWORD };

    const first = await expired.post('/auth/password-reset/confirm', body);
    const second = await verification.post('/auth/password-reset/confirm', body);

    for (const response of [first, second]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual(INVALID_LINK);
    }
    expect((await expired.kit.users.findById(expiredUser.id))?.passwordHash).toBe(
      `hashed:${PASSWORD}`,
    );
  });

  it('answers 400 for a password of 11 characters and keeps the token usable', async () => {
    const { post, kit } = buildAuthServer();
    const user = await seedAccount(kit, { verified: true });
    await seedResetToken(kit, user.id);

    const short = await post('/auth/password-reset/confirm', {
      token: 'raw-token',
      password: 'elevenchars',
    });
    const valid = await post('/auth/password-reset/confirm', {
      token: 'raw-token',
      password: NEW_PASSWORD,
    });

    expect(short.statusCode).toBe(400);
    expect(valid.statusCode).toBe(204);
  });
});
