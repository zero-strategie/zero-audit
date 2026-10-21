import { describe, expect, it } from 'vitest';
import { VERIFY_TTL_MS } from '../../src/domain/email-token.js';
import { SESSION_TTL_MS } from '../../src/domain/session.js';
import { NOW } from '../support/auth-doubles.js';
import { buildAuthServer, PASSWORD, seedAccount } from './auth-support.js';

const credentials = { email: 'alice@exemple.test', password: PASSWORD };
const BAD_CREDENTIALS = {
  error: { code: 'unauthenticated', message: 'E-mail ou mot de passe incorrect' },
};

describe('POST /auth/verify-email', () => {
  const seedToken = async (kit: ReturnType<typeof buildAuthServer>['kit']) => {
    const user = await seedAccount(kit, { verified: false });
    await kit.emailTokens.create({
      token: 'raw-token',
      userId: user.id,
      email: user.email,
      kind: 'verify',
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + VERIFY_TTL_MS),
    });
    return user;
  };

  it('verifies the account, consumes the token and returns a session identifier', async () => {
    const { post, get, kit } = buildAuthServer();
    const user = await seedToken(kit);

    const response = await post('/auth/verify-email', { token: 'raw-token' });

    expect(response.statusCode).toBe(200);
    const { sessionId } = response.json<{ sessionId: string }>();
    expect(Buffer.from(sessionId, 'base64url').length).toBeGreaterThan(0);
    expect((await kit.users.findById(user.id))?.verifiedAt).toEqual(NOW);
    expect((await get('/auth/me', { 'x-session-id': sessionId })).statusCode).toBe(200);

    const replay = await post('/auth/verify-email', { token: 'raw-token' });
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toEqual({
      error: { code: 'invalid_request', message: 'Ce lien est invalide ou a expiré' },
    });
  });

  it('answers the same 400 for an expired or unknown token', async () => {
    const { post, kit } = buildAuthServer();
    await seedToken(kit);
    kit.clock.advance(VERIFY_TTL_MS + 1);

    const expired = await post('/auth/verify-email', { token: 'raw-token' });
    const unknown = await post('/auth/verify-email', { token: 'whatever' });

    expect(expired.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(400);
    expect(unknown.body).toBe(expired.body);
  });
});

describe('POST /auth/login', () => {
  it('answers 403 for an unverified account with the right password, 401 with a wrong one', async () => {
    const { post, kit } = buildAuthServer();
    await seedAccount(kit, { verified: false });

    const right = await post('/auth/login', credentials);
    const wrong = await post('/auth/login', { ...credentials, password: 'wrong password!' });

    expect(right.statusCode).toBe(403);
    expect(right.json()).toEqual({
      error: { code: 'forbidden', message: "Confirmez d'abord votre adresse e-mail" },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual(BAD_CREDENTIALS);
  });

  it('answers 401 for an unknown address after a dummy hash computation', async () => {
    const { post, kit } = buildAuthServer();

    const response = await post('/auth/login', credentials);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(BAD_CREDENTIALS);
    expect(kit.passwordHasher.dummyCalls).toBe(1);
  });

  it('returns two different 30-day sessions stored hashed for a verified account', async () => {
    const { post, kit } = buildAuthServer();
    await seedAccount(kit, { verified: true });

    const first = (await post('/auth/login', credentials)).json<{ sessionId: string }>();
    const second = (await post('/auth/login', credentials)).json<{ sessionId: string }>();

    expect(second.sessionId).not.toBe(first.sessionId);
    for (const { sessionId } of [first, second]) {
      const session = await kit.sessions.findValid(sessionId, NOW);
      expect(session?.expiresAt).toEqual(new Date(NOW.getTime() + SESSION_TTL_MS));
      expect(session?.idHash).not.toBe(sessionId);
    }
  });
});

describe('POST /auth/logout and GET /auth/me', () => {
  it('logs out the given session only', async () => {
    const { post, get, kit } = buildAuthServer();
    await seedAccount(kit, { verified: true });
    const first = (await post('/auth/login', credentials)).json<{ sessionId: string }>();
    const second = (await post('/auth/login', credentials)).json<{ sessionId: string }>();

    const response = await post('/auth/logout', undefined, { 'x-session-id': first.sessionId });

    expect(response.statusCode).toBe(204);
    expect((await get('/auth/me', { 'x-session-id': first.sessionId })).statusCode).toBe(401);
    expect((await get('/auth/me', { 'x-session-id': second.sessionId })).statusCode).toBe(200);
  });

  it('answers 401 without a valid session', async () => {
    const { post, get } = buildAuthServer();

    expect((await post('/auth/logout')).statusCode).toBe(401);
    expect((await get('/auth/me')).statusCode).toBe(401);
    const unknown = await get('/auth/me', { 'x-session-id': 'unknown' });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toEqual({
      error: { code: 'unauthenticated', message: 'Connexion requise' },
    });
  });

  it('answers 401 once the session has expired', async () => {
    const { post, get, kit } = buildAuthServer();
    await seedAccount(kit, { verified: true });
    const { sessionId } = (await post('/auth/login', credentials)).json<{ sessionId: string }>();
    kit.clock.advance(SESSION_TTL_MS);

    expect((await get('/auth/me', { 'x-session-id': sessionId })).statusCode).toBe(401);
  });

  it('returns the e-mail and whether it is an administrator one, ignoring case', async () => {
    const admin = buildAuthServer(['alice@exemple.test']);
    const regular = buildAuthServer([]);
    for (const { kit } of [admin, regular]) await seedAccount(kit, { verified: true });
    const adminSession = (await admin.post('/auth/login', credentials)).json<{
      sessionId: string;
    }>();
    const regularSession = (await regular.post('/auth/login', credentials)).json<{
      sessionId: string;
    }>();

    const adminMe = await admin.get('/auth/me', { 'x-session-id': adminSession.sessionId });
    const regularMe = await regular.get('/auth/me', { 'x-session-id': regularSession.sessionId });

    expect(adminMe.json()).toMatchObject({ email: 'alice@exemple.test', isAdmin: true });
    expect(regularMe.json()).toMatchObject({ email: 'alice@exemple.test', isAdmin: false });
  });
});
