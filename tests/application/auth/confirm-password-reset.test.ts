import { describe, expect, it } from 'vitest';
import { ConfirmPasswordReset } from '../../../src/application/auth/confirm-password-reset.js';
import { RESET_TTL_MS } from '../../../src/domain/email-token.js';
import { InvalidOrExpiredToken, InvalidPassword } from '../../../src/domain/errors.js';
import { buildAuthKit, NOW } from '../../support/auth-doubles.js';

const NEW_PASSWORD = 'a brand new password';

const setup = async () => {
  const kit = buildAuthKit();
  const user = await kit.users.create({
    email: 'alice@exemple.test',
    passwordHash: 'hashed:old password!!',
    createdAt: NOW,
  });
  await kit.users.markVerified(user.id, NOW);
  const issue = (token: string, kind: 'reset' | 'verify' = 'reset') =>
    kit.emailTokens.create({
      token,
      userId: user.id,
      email: user.email,
      kind,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + RESET_TTL_MS),
    });
  const passwordHash = async () => (await kit.users.findById(user.id))?.passwordHash;
  return { kit, user, issue, passwordHash, confirm: new ConfirmPasswordReset(kit) };
};

describe('ConfirmPasswordReset', () => {
  it('changes the password, ends every session and consumes the token', async () => {
    const { kit, user, issue, passwordHash, confirm } = await setup();
    await issue('reset-token');
    const lifetime = { userId: user.id, createdAt: NOW, expiresAt: new Date(NOW.getTime() + 1e9) };
    await kit.sessions.create({ id: 'session-1', ...lifetime });
    await kit.sessions.create({ id: 'session-2', ...lifetime });

    await confirm.execute({ token: 'reset-token', password: NEW_PASSWORD });

    expect(await passwordHash()).toBe(`hashed:${NEW_PASSWORD}`);
    expect(await kit.sessions.findValid('session-1', NOW)).toBeNull();
    expect(await kit.sessions.findValid('session-2', NOW)).toBeNull();
    await expect(confirm.execute({ token: 'reset-token', password: NEW_PASSWORD })).rejects.toThrow(
      InvalidOrExpiredToken,
    );
  });

  it('refuses an expired, unknown or verification token and changes nothing', async () => {
    const { kit, issue, passwordHash, confirm } = await setup();
    await issue('expired-token');
    await issue('verify-token', 'verify');
    kit.clock.advance(RESET_TTL_MS);

    for (const token of ['expired-token', 'unknown', 'verify-token']) {
      await expect(confirm.execute({ token, password: NEW_PASSWORD })).rejects.toThrow(
        InvalidOrExpiredToken,
      );
    }

    expect(await passwordHash()).toBe('hashed:old password!!');
  });

  it('refuses a short password without consuming the token', async () => {
    const { issue, passwordHash, confirm } = await setup();
    await issue('reset-token');

    await expect(
      confirm.execute({ token: 'reset-token', password: 'elevenchars' }),
    ).rejects.toThrow(InvalidPassword);
    await confirm.execute({ token: 'reset-token', password: NEW_PASSWORD });

    expect(await passwordHash()).toBe(`hashed:${NEW_PASSWORD}`);
  });
});
