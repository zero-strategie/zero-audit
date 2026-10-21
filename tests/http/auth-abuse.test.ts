import { describe, expect, it } from 'vitest';
import { LOGIN_WINDOW_MS } from '../../src/domain/abuse-limits.js';
import { buildAuthServer, PASSWORD, seedAccount } from './auth-support.js';

const credentials = { email: 'alice@exemple.test', password: PASSWORD };
const wrong = { ...credentials, password: 'wrong password!' };
const TOO_MANY = {
  error: {
    code: 'too_many_attempts',
    message: 'Trop de tentatives, réessayez dans quelques minutes',
  },
};
const from = (ip: string) => ({ 'x-real-ip': ip });

describe('login limits', () => {
  it('answers 429 from the 6th attempt on an account, even with the right password, until 15 minutes passed', async () => {
    const { post, kit } = buildAuthServer();
    await seedAccount(kit, { verified: true });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await post('/auth/login', wrong, from(`198.51.100.${String(attempt)}`));
    }

    const blocked = await post('/auth/login', credentials, from('198.51.100.99'));
    kit.clock.advance(LOGIN_WINDOW_MS);
    const later = await post('/auth/login', credentials, from('198.51.100.99'));

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual(TOO_MANY);
    expect(later.statusCode).toBe(200);
  });

  it('answers 429 to the 21st failure of an address without hashing, and spares other addresses', async () => {
    const { post, kit } = buildAuthServer();
    await seedAccount(kit, { verified: true });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await post(
        '/auth/login',
        { ...wrong, email: `user${String(attempt)}@exemple.test` },
        from('203.0.113.7'),
      );
    }
    const verificationsBefore = kit.passwordHasher.verifications;

    const blocked = await post('/auth/login', credentials, from('203.0.113.7'));
    const verificationsAfter = kit.passwordHasher.verifications;
    const other = await post('/auth/login', credentials, from('203.0.113.8'));

    expect(blocked.statusCode).toBe(429);
    expect(verificationsAfter).toBe(verificationsBefore);
    expect(other.statusCode).toBe(200);
  });

  it('keys the limit on the connection address when X-Real-IP is missing', async () => {
    const { post, kit } = buildAuthServer();
    await seedAccount(kit, { verified: true });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await post('/auth/login', { ...wrong, email: `user${String(attempt)}@exemple.test` });
    }

    const sameConnection = await post('/auth/login', credentials);
    const otherAddress = await post('/auth/login', credentials, from('203.0.113.8'));

    expect(sameConnection.statusCode).toBe(429);
    expect(otherAddress.statusCode).toBe(200);
  });
});

describe('sign-up limit', () => {
  it('answers 429 to the 6th sign-up of an address within the hour and creates no account', async () => {
    const { post, kit } = buildAuthServer();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await post(
        '/auth/register',
        { email: `user${String(attempt)}@exemple.test`, password: PASSWORD },
        from('203.0.113.7'),
      );
    }

    const blocked = await post(
      '/auth/register',
      { email: 'late@exemple.test', password: PASSWORD },
      from('203.0.113.7'),
    );

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual(TOO_MANY);
    expect(await kit.users.findByEmail('late@exemple.test')).toBeNull();
  });
});
