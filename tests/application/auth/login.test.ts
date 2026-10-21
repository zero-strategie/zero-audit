import { describe, expect, it } from 'vitest';
import { Login } from '../../../src/application/auth/login.js';
import { OpenSession } from '../../../src/application/auth/open-session.js';
import { EmailNotVerified, Unauthenticated } from '../../../src/domain/errors.js';
import { SESSION_TTL_MS } from '../../../src/domain/session.js';
import { buildAuthKit, NOW } from '../../support/auth-doubles.js';

const PASSWORD = 'correct horse battery';

const setup = async (verified: boolean) => {
  const kit = buildAuthKit();
  const user = await kit.users.create({
    email: 'alice@exemple.test',
    passwordHash: `hashed:${PASSWORD}`,
    createdAt: NOW,
  });
  if (verified) await kit.users.markVerified(user.id, NOW);
  return { kit, user, login: new Login({ ...kit, openSession: new OpenSession(kit) }) };
};

describe('Login', () => {
  it('opens a distinct 30-day session at each login, stored hashed', async () => {
    const { kit, user, login } = await setup(true);

    const first = await login.execute({ email: ' Alice@Exemple.test', password: PASSWORD });
    const second = await login.execute({ email: 'alice@exemple.test', password: PASSWORD });

    expect(second).not.toBe(first);
    for (const id of [first, second]) {
      const session = await kit.sessions.findValid(id, NOW);
      expect(session).toMatchObject({
        userId: user.id,
        expiresAt: new Date(NOW.getTime() + SESSION_TTL_MS),
      });
      expect(session?.idHash).not.toBe(id);
    }
  });

  it('refuses a wrong password with Unauthenticated, even on an unverified account', async () => {
    const verified = await setup(true);
    const unverified = await setup(false);

    await expect(
      verified.login.execute({ email: 'alice@exemple.test', password: 'wrong password!' }),
    ).rejects.toThrow(Unauthenticated);
    await expect(
      unverified.login.execute({ email: 'alice@exemple.test', password: 'wrong password!' }),
    ).rejects.toThrow(Unauthenticated);
  });

  it('asks an unverified account with the right password to confirm its address first', async () => {
    const { login } = await setup(false);

    await expect(
      login.execute({ email: 'alice@exemple.test', password: PASSWORD }),
    ).rejects.toThrow(EmailNotVerified);
  });

  it('spends a hash computation on an unknown or malformed address', async () => {
    const { kit, login } = await setup(true);

    await expect(
      login.execute({ email: 'nobody@exemple.test', password: PASSWORD }),
    ).rejects.toThrow(Unauthenticated);
    await expect(login.execute({ email: 'no-at-sign', password: PASSWORD })).rejects.toThrow(
      Unauthenticated,
    );

    expect(kit.passwordHasher.dummyCalls).toBe(2);
  });
});
