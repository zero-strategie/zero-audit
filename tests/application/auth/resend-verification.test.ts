import { describe, expect, it } from 'vitest';
import { ResendVerification } from '../../../src/application/auth/resend-verification.js';
import { SendVerificationLink } from '../../../src/application/auth/send-verification-link.js';
import { MailerUnavailable } from '../../../src/domain/errors.js';
import { buildAuthKit, NOW, PUBLIC_URL } from '../../support/auth-doubles.js';

const setup = () => {
  const kit = buildAuthKit();
  return {
    kit,
    resend: new ResendVerification({ ...kit, sendVerificationLink: new SendVerificationLink(kit) }),
  };
};

const seed = async (kit: ReturnType<typeof buildAuthKit>, verified: boolean) => {
  const user = await kit.users.create({
    email: 'alice@exemple.test',
    passwordHash: 'hashed:x',
    createdAt: NOW,
  });
  if (verified) await kit.users.markVerified(user.id, NOW);
};

describe('ResendVerification', () => {
  it('mails a new link to an unverified account', async () => {
    const { kit, resend } = setup();
    await seed(kit, false);

    await resend.execute({ email: 'Alice@exemple.test' });

    expect(kit.mailer.sent).toEqual([
      { to: 'alice@exemple.test', link: `${PUBLIC_URL}/verifier-email?token=token-1` },
    ]);
  });

  it('sends nothing for a verified, unknown or malformed address', async () => {
    const { kit, resend } = setup();
    await seed(kit, true);

    await resend.execute({ email: 'alice@exemple.test' });
    await resend.execute({ email: 'nobody@exemple.test' });
    await resend.execute({ email: 'not-an-email' });

    expect(kit.mailer.sent).toEqual([]);
  });

  it('stops after 3 links in the hour', async () => {
    const { kit, resend } = setup();
    await seed(kit, false);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await resend.execute({ email: 'alice@exemple.test' });
    }

    expect(kit.mailer.sent).toHaveLength(3);
  });

  it('raises MailerUnavailable when no mailer can send', async () => {
    const { kit, resend } = setup();
    kit.mailer.enabled = false;

    await expect(resend.execute({ email: 'nobody@exemple.test' })).rejects.toThrow(
      MailerUnavailable,
    );
  });
});
