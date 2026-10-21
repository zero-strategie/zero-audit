import { describe, expect, it } from 'vitest';
import { Login } from '../../../src/application/auth/login.js';
import { OpenSession } from '../../../src/application/auth/open-session.js';
import { LOGIN_WINDOW_MS } from '../../../src/domain/abuse-limits.js';
import { EmailNotVerified, TooManyAttempts, Unauthenticated } from '../../../src/domain/errors.js';
import { SESSION_TTL_MS } from '../../../src/domain/session.js';
import { buildAuthKit, NOW } from '../../support/auth-doubles.js';

const PASSWORD = 'correct horse battery';
const IP = '203.0.113.7';

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

    const first = await login.execute({ email: ' Alice@Exemple.test', password: PASSWORD, ip: IP });
    const second = await login.execute({ email: 'alice@exemple.test', password: PASSWORD, ip: IP });

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
      verified.login.execute({ email: 'alice@exemple.test', password: 'wrong password!', ip: IP }),
    ).rejects.toThrow(Unauthenticated);
    await expect(
      unverified.login.execute({
        email: 'alice@exemple.test',
        password: 'wrong password!',
        ip: IP,
      }),
    ).rejects.toThrow(Unauthenticated);
  });

  it('asks an unverified account with the right password to confirm its address first', async () => {
    const { login } = await setup(false);

    await expect(
      login.execute({ email: 'alice@exemple.test', password: PASSWORD, ip: IP }),
    ).rejects.toThrow(EmailNotVerified);
  });

  it('spends a hash computation on an unknown or malformed address', async () => {
    const { kit, login } = await setup(true);

    await expect(
      login.execute({ email: 'nobody@exemple.test', password: PASSWORD, ip: IP }),
    ).rejects.toThrow(Unauthenticated);
    await expect(
      login.execute({ email: 'no-at-sign', password: PASSWORD, ip: IP }),
    ).rejects.toThrow(Unauthenticated);

    expect(kit.passwordHasher.dummyCalls).toBe(2);
  });

  describe('anti-abuse', () => {
    const failAs = (login: Login, email: string, ip: string, times: number) =>
      Promise.all(
        Array.from({ length: times }, () =>
          login.execute({ email, password: 'wrong password!', ip }).catch(() => undefined),
        ),
      );

    it('blocks the 6th attempt on an account even with the right password, until the window passed', async () => {
      const { kit, login } = await setup(true);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await failAs(login, 'alice@exemple.test', `198.51.100.${String(attempt)}`, 1);
      }

      await expect(
        login.execute({ email: 'alice@exemple.test', password: PASSWORD, ip: IP }),
      ).rejects.toThrow(TooManyAttempts);

      kit.clock.advance(LOGIN_WINDOW_MS);
      await expect(
        login.execute({ email: 'alice@exemple.test', password: PASSWORD, ip: IP }),
      ).resolves.toEqual(expect.any(String));
    });

    it('blocks the 21st attempt of an address before any hash computation, others are unaffected', async () => {
      const { kit, login } = await setup(true);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await failAs(login, `user${String(attempt)}@exemple.test`, IP, 1);
      }
      const verificationsBefore = kit.passwordHasher.verifications;

      await expect(
        login.execute({ email: 'alice@exemple.test', password: PASSWORD, ip: IP }),
      ).rejects.toThrow(TooManyAttempts);

      expect(kit.passwordHasher.verifications).toBe(verificationsBefore);
      await expect(
        login.execute({ email: 'alice@exemple.test', password: PASSWORD, ip: '198.51.100.9' }),
      ).resolves.toEqual(expect.any(String));
    });

    it('counts unknown addresses too, so that the limit reveals nothing', async () => {
      const { login } = await setup(true);
      await failAs(login, 'nobody@exemple.test', IP, 5);

      await expect(
        login.execute({ email: 'nobody@exemple.test', password: PASSWORD, ip: IP }),
      ).rejects.toThrow(TooManyAttempts);
    });
  });
});
