import { describe, expect, it } from 'vitest';
import { GetCurrentAccount } from '../../../src/application/auth/get-current-account.js';
import { Logout } from '../../../src/application/auth/logout.js';
import { OpenSession } from '../../../src/application/auth/open-session.js';
import { ResolveSession } from '../../../src/application/auth/resolve-session.js';
import { Unauthenticated } from '../../../src/domain/errors.js';
import { SESSION_TTL_MS } from '../../../src/domain/session.js';
import { buildAuthKit, NOW } from '../../support/auth-doubles.js';

const setup = async () => {
  const kit = buildAuthKit();
  const user = await kit.users.create({
    email: 'alice@exemple.test',
    passwordHash: 'hashed:x',
    createdAt: NOW,
  });
  const openSession = new OpenSession(kit);
  const first = await openSession.execute(user.id);
  const second = await openSession.execute(user.id);
  const resolveSession = new ResolveSession(kit);
  return { kit, user, first, second, resolveSession };
};

describe('ResolveSession', () => {
  it('returns the owner of a valid session', async () => {
    const { user, first, resolveSession } = await setup();

    expect(await resolveSession.execute(first)).toEqual(user);
  });

  it('returns null without identifier, with an unknown one or once expired', async () => {
    const { kit, first, resolveSession } = await setup();

    expect(await resolveSession.execute(undefined)).toBeNull();
    expect(await resolveSession.execute('unknown')).toBeNull();
    kit.clock.advance(SESSION_TTL_MS);
    expect(await resolveSession.execute(first)).toBeNull();
  });
});

describe('Logout', () => {
  it('deletes only the given session', async () => {
    const { first, second, resolveSession, kit } = await setup();

    await new Logout({ resolveSession, sessions: kit.sessions }).execute(first);

    expect(await resolveSession.execute(first)).toBeNull();
    expect(await resolveSession.execute(second)).not.toBeNull();
  });

  it('is refused without a valid session', async () => {
    const { resolveSession, kit } = await setup();
    const logout = new Logout({ resolveSession, sessions: kit.sessions });

    await expect(logout.execute(undefined)).rejects.toThrow(Unauthenticated);
    await expect(logout.execute('unknown')).rejects.toThrow(Unauthenticated);
  });
});

describe('GetCurrentAccount', () => {
  it('returns the e-mail and flags administrators case-insensitively', async () => {
    const { first, resolveSession } = await setup();

    const admin = new GetCurrentAccount({ resolveSession, adminEmails: ['alice@exemple.test'] });
    const other = new GetCurrentAccount({ resolveSession, adminEmails: ['bob@exemple.test'] });

    expect(await admin.execute(first)).toEqual({ email: 'alice@exemple.test', isAdmin: true });
    expect(await other.execute(first)).toEqual({ email: 'alice@exemple.test', isAdmin: false });
  });

  it('is refused without a valid session', async () => {
    const { resolveSession } = await setup();
    const current = new GetCurrentAccount({ resolveSession, adminEmails: [] });

    await expect(current.execute(undefined)).rejects.toThrow(Unauthenticated);
  });
});
