import { describe, expect, it } from 'vitest';
import { OpenSession } from '../../../src/application/auth/open-session.js';
import { ResolveReader } from '../../../src/application/auth/resolve-reader.js';
import { ResolveSession } from '../../../src/application/auth/resolve-session.js';
import { ANONYMOUS_READER } from '../../../src/domain/reader.js';
import { buildAuthKit, NOW } from '../../support/auth-doubles.js';

const setup = async (email = 'alice@exemple.test') => {
  const kit = buildAuthKit();
  const user = await kit.users.create({ email, passwordHash: 'h', createdAt: NOW });
  const sessionId = await new OpenSession(kit).execute(user.id);
  const resolveReader = new ResolveReader({
    resolveSession: new ResolveSession(kit),
    adminEmails: ['admin@exemple.test'],
  });
  return { user, sessionId, resolveReader };
};

describe('ResolveReader', () => {
  it('reads anonymously without a session or with an unknown one', async () => {
    const { resolveReader } = await setup();

    expect(await resolveReader.execute(undefined)).toEqual(ANONYMOUS_READER);
    expect(await resolveReader.execute('unknown')).toEqual(ANONYMOUS_READER);
  });

  it('reads as the account behind a valid session', async () => {
    const { user, sessionId, resolveReader } = await setup();

    expect(await resolveReader.execute(sessionId)).toEqual({
      kind: 'account',
      userId: user.id,
      isAdmin: false,
    });
  });

  it('flags an administrator by e-mail address', async () => {
    const { sessionId, resolveReader } = await setup('admin@exemple.test');

    expect(await resolveReader.execute(sessionId)).toMatchObject({ isAdmin: true });
  });
});
