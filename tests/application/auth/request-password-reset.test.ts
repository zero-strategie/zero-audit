import { describe, expect, it } from 'vitest';
import { RequestPasswordReset } from '../../../src/application/auth/request-password-reset.js';
import { RESET_TTL_MS } from '../../../src/domain/email-token.js';
import { MailerUnavailable } from '../../../src/domain/errors.js';
import { buildAuthKit, NOW, PUBLIC_URL } from '../../support/auth-doubles.js';

const setup = async (verified = true) => {
  const kit = buildAuthKit();
  const user = await kit.users.create({
    email: 'alice@exemple.test',
    passwordHash: 'hashed:x',
    createdAt: NOW,
  });
  if (verified) await kit.users.markVerified(user.id, NOW);
  return { kit, user, request: new RequestPasswordReset(kit) };
};

describe('RequestPasswordReset', () => {
  it('mails a reset link valid for one hour to a verified account', async () => {
    const { kit, request } = await setup();

    await request.execute({ email: ' Alice@exemple.test' });

    expect(kit.mailer.sent).toEqual([
      { to: 'alice@exemple.test', link: `${PUBLIC_URL}/reinitialiser?token=token-1` },
    ]);
    const token = await kit.emailTokens.consume('token-1', 'reset', NOW);
    expect(token?.expiresAt).toEqual(new Date(NOW.getTime() + RESET_TTL_MS));
  });

  it('sends nothing for an unknown, malformed or unverified address', async () => {
    const unverified = await setup(false);
    const verified = await setup();

    await unverified.request.execute({ email: 'alice@exemple.test' });
    await verified.request.execute({ email: 'nobody@exemple.test' });
    await verified.request.execute({ email: 'not-an-email' });

    expect(unverified.kit.mailer.sent).toEqual([]);
    expect(verified.kit.mailer.sent).toEqual([]);
  });

  it('stops after 3 links in the hour', async () => {
    const { kit, request } = await setup();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request.execute({ email: 'alice@exemple.test' });
    }

    expect(kit.mailer.sent).toHaveLength(3);
  });

  it('raises MailerUnavailable when no mailer can send', async () => {
    const { kit, request } = await setup();
    kit.mailer.enabled = false;

    await expect(request.execute({ email: 'alice@exemple.test' })).rejects.toThrow(
      MailerUnavailable,
    );
  });
});
