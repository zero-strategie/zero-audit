import { describe, expect, it } from 'vitest';
import { OpenSession } from '../../../src/application/auth/open-session.js';
import { VerifyEmail } from '../../../src/application/auth/verify-email.js';
import { VERIFY_TTL_MS } from '../../../src/domain/email-token.js';
import { InvalidOrExpiredToken } from '../../../src/domain/errors.js';
import { SESSION_TTL_MS } from '../../../src/domain/session.js';
import { buildAuthKit, NOW } from '../../support/auth-doubles.js';

const setup = async () => {
  const kit = buildAuthKit();
  const user = await kit.users.create({
    email: 'alice@exemple.test',
    passwordHash: 'hashed:x',
    createdAt: NOW,
  });
  await kit.emailTokens.create({
    token: 'raw-verify-token',
    userId: user.id,
    email: user.email,
    kind: 'verify',
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + VERIFY_TTL_MS),
  });
  return { kit, user, verify: new VerifyEmail({ ...kit, openSession: new OpenSession(kit) }) };
};

describe('VerifyEmail', () => {
  it('marks the account verified and opens a 30-day session', async () => {
    const { kit, user, verify } = await setup();

    const sessionId = await verify.execute('raw-verify-token');

    expect((await kit.users.findById(user.id))?.verifiedAt).toEqual(NOW);
    const session = await kit.sessions.findValid(sessionId, NOW);
    expect(session).toMatchObject({
      userId: user.id,
      expiresAt: new Date(NOW.getTime() + SESSION_TTL_MS),
    });
    expect(session?.idHash).not.toBe(sessionId);
  });

  it('refuses the same token a second time', async () => {
    const { verify } = await setup();
    await verify.execute('raw-verify-token');

    await expect(verify.execute('raw-verify-token')).rejects.toThrow(InvalidOrExpiredToken);
  });

  it('refuses an unknown token and an expired one', async () => {
    const { kit, verify } = await setup();

    await expect(verify.execute('unknown')).rejects.toThrow(InvalidOrExpiredToken);

    kit.clock.advance(VERIFY_TTL_MS + 1);
    await expect(verify.execute('raw-verify-token')).rejects.toThrow(InvalidOrExpiredToken);
  });

  it('refuses a password reset token', async () => {
    const { kit, user, verify } = await setup();
    await kit.emailTokens.create({
      token: 'raw-reset-token',
      userId: user.id,
      email: user.email,
      kind: 'reset',
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + VERIFY_TTL_MS),
    });

    await expect(verify.execute('raw-reset-token')).rejects.toThrow(InvalidOrExpiredToken);
  });
});
