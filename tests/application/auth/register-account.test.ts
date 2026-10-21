import { describe, expect, it } from 'vitest';
import { SendVerificationLink } from '../../../src/application/auth/send-verification-link.js';
import { RegisterAccount } from '../../../src/application/auth/register-account.js';
import {
  InvalidEmail,
  InvalidPassword,
  MailerUnavailable,
  TooManyAttempts,
} from '../../../src/domain/errors.js';
import { VERIFY_TTL_MS } from '../../../src/domain/email-token.js';
import { buildAuthKit, HOUR_MS, NOW, PUBLIC_URL } from '../../support/auth-doubles.js';

const PASSWORD = 'correct horse battery';
const IP = '203.0.113.7';

const setup = () => {
  const kit = buildAuthKit();
  return {
    kit,
    register: new RegisterAccount({ ...kit, sendVerificationLink: new SendVerificationLink(kit) }),
  };
};

describe('RegisterAccount', () => {
  it('creates an unverified account, stores a hashed 24 h token and mails the raw token', async () => {
    const { kit, register } = setup();

    await register.execute({ email: ' Alice@Exemple.Test ', password: PASSWORD, ip: IP });

    const user = await kit.users.findByEmail('alice@exemple.test');
    expect(user).toMatchObject({ verifiedAt: null, passwordHash: `hashed:${PASSWORD}` });
    expect(kit.mailer.sent).toEqual([
      {
        to: 'alice@exemple.test',
        link: `${PUBLIC_URL}/verifier-email?token=token-1`,
      },
    ]);
    const stored = await kit.emailTokens.consume(
      'token-1',
      'verify',
      new Date(NOW.getTime() + VERIFY_TTL_MS - 1),
    );
    expect(stored).toMatchObject({ userId: user?.id, kind: 'verify' });
    expect(stored?.tokenHash).not.toContain('token-1');
    expect(stored?.expiresAt).toEqual(new Date(NOW.getTime() + VERIFY_TTL_MS));
  });

  it('sends nothing for an address that is already verified', async () => {
    const { kit, register } = setup();
    await register.execute({ email: 'alice@exemple.test', password: PASSWORD, ip: IP });
    const user = await kit.users.findByEmail('alice@exemple.test');
    await kit.users.markVerified(user?.id ?? '', NOW);
    kit.mailer.sent.length = 0;

    await register.execute({ email: 'alice@exemple.test', password: 'another password!', ip: IP });

    expect(kit.mailer.sent).toEqual([]);
    expect((await kit.users.findByEmail('alice@exemple.test'))?.passwordHash).toBe(
      `hashed:${PASSWORD}`,
    );
  });

  it('replaces the password and mails a new link for an unverified address', async () => {
    const { kit, register } = setup();
    await register.execute({ email: 'alice@exemple.test', password: PASSWORD, ip: IP });

    await register.execute({ email: 'alice@exemple.test', password: 'another password!', ip: IP });

    expect((await kit.users.findByEmail('alice@exemple.test'))?.passwordHash).toBe(
      'hashed:another password!',
    );
    expect(kit.mailer.sent.map((mail) => mail.link)).toEqual([
      `${PUBLIC_URL}/verifier-email?token=token-1`,
      `${PUBLIC_URL}/verifier-email?token=token-2`,
    ]);
  });

  it('sends at most 3 links per hour for an address, then again once the hour has passed', async () => {
    const { kit, register } = setup();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await register.execute({ email: 'alice@exemple.test', password: PASSWORD, ip: IP });
    }
    expect(kit.mailer.sent).toHaveLength(3);

    kit.clock.advance(HOUR_MS + 1);
    await register.execute({ email: 'alice@exemple.test', password: PASSWORD, ip: IP });

    expect(kit.mailer.sent).toHaveLength(4);
  });

  it('rejects an invalid address or a password shorter than 12 characters without creating an account', async () => {
    const { kit, register } = setup();

    await expect(
      register.execute({ email: 'not-an-email', password: PASSWORD, ip: IP }),
    ).rejects.toThrow(InvalidEmail);
    await expect(
      register.execute({ email: 'alice@exemple.test', password: 'elevenchars', ip: IP }),
    ).rejects.toThrow(InvalidPassword);

    expect(await kit.users.findByEmail('alice@exemple.test')).toBeNull();
    expect(kit.mailer.sent).toEqual([]);
  });

  it('ignores a request whose trap field is filled', async () => {
    const { kit, register } = setup();

    await register.execute({
      ip: IP,
      email: 'alice@exemple.test',
      password: PASSWORD,
      website: 'https://spam.test',
    });

    expect(await kit.users.findByEmail('alice@exemple.test')).toBeNull();
    expect(kit.mailer.sent).toEqual([]);
  });

  it('raises MailerUnavailable whatever the address when no mailer can send', async () => {
    const { kit, register } = setup();
    await register.execute({ email: 'alice@exemple.test', password: PASSWORD, ip: IP });
    const user = await kit.users.findByEmail('alice@exemple.test');
    await kit.users.markVerified(user?.id ?? '', NOW);
    kit.mailer.enabled = false;

    await expect(
      register.execute({ email: 'alice@exemple.test', password: PASSWORD, ip: IP }),
    ).rejects.toThrow(MailerUnavailable);
    await expect(
      register.execute({ email: 'bob@exemple.test', password: PASSWORD, ip: IP }),
    ).rejects.toThrow(MailerUnavailable);
    expect(await kit.users.findByEmail('bob@exemple.test')).toBeNull();
  });

  it('refuses the 6th sign-up of an hour from the same address without creating an account', async () => {
    const { kit, register } = setup();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await register.execute({
        email: `user${String(attempt)}@exemple.test`,
        password: PASSWORD,
        ip: IP,
      });
    }

    await expect(
      register.execute({ email: 'late@exemple.test', password: PASSWORD, ip: IP }),
    ).rejects.toThrow(TooManyAttempts);
    expect(await kit.users.findByEmail('late@exemple.test')).toBeNull();
    await register.execute({ email: 'other@exemple.test', password: PASSWORD, ip: '198.51.100.9' });
    expect(await kit.users.findByEmail('other@exemple.test')).not.toBeNull();

    kit.clock.advance(HOUR_MS);
    await register.execute({ email: 'late@exemple.test', password: PASSWORD, ip: IP });
    expect(await kit.users.findByEmail('late@exemple.test')).not.toBeNull();
  });
});
