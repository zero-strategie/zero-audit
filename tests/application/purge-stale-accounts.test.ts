import { describe, expect, it } from 'vitest';
import { PurgeStaleAccounts } from '../../src/application/purge-stale-accounts.js';
import { InMemoryAccountEraser } from '../../src/infrastructure/in-memory-account-eraser.js';
import { InMemoryEmailTokenRepository } from '../../src/infrastructure/in-memory-email-token-repository.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySessionRepository } from '../../src/infrastructure/in-memory-session-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { InMemoryUserRepository } from '../../src/infrastructure/in-memory-user-repository.js';
import { seedAccount } from '../support/account-eraser-contract.js';

const NOW = new Date('2026-03-10T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const setup = () => {
  const stores = {
    users: new InMemoryUserRepository(),
    projects: new InMemoryProjectRepository(),
    snapshots: new InMemorySnapshotRepository(),
    sessions: new InMemorySessionRepository(),
    emailTokens: new InMemoryEmailTokenRepository(),
  };
  const eraser = new InMemoryAccountEraser(stores);
  const purge = new PurgeStaleAccounts({
    eraser,
    sessions: stores.sessions,
    emailTokens: stores.emailTokens,
    clock: { now: () => NOW.getTime() },
  });
  return { stores, storage: { ...stores, eraser }, purge };
};

describe('PurgeStaleAccounts', () => {
  it('erases the account unverified for 8 days with its data, and keeps younger and verified ones', async () => {
    const { stores, storage, purge } = setup();
    const old = await seedAccount(storage, {
      email: 'old@example.fr',
      createdAt: new Date(NOW.getTime() - 8 * DAY_MS),
    });
    const recent = await seedAccount(storage, {
      email: 'recent@example.fr',
      createdAt: new Date(NOW.getTime() - 6 * DAY_MS),
    });
    const verified = await seedAccount(storage, {
      email: 'verified@example.fr',
      createdAt: new Date(NOW.getTime() - 90 * DAY_MS),
      verified: true,
    });

    await purge.execute();

    expect(await stores.users.findById(old.userId)).toBeNull();
    expect(await stores.snapshots.getById(old.seeded.snapshotId)).toBeNull();
    expect(await stores.users.findById(recent.userId)).not.toBeNull();
    expect(await stores.users.findById(verified.userId)).not.toBeNull();
  });

  it('deletes the expired sessions and tokens and keeps the others', async () => {
    const { stores, purge } = setup();
    const user = await stores.users.create({
      email: 'u@example.fr',
      passwordHash: 'h',
      createdAt: NOW,
    });
    const past = new Date(NOW.getTime() - DAY_MS);
    const future = new Date(NOW.getTime() + DAY_MS);
    await stores.sessions.create({
      id: 'expired',
      userId: user.id,
      createdAt: past,
      expiresAt: past,
    });
    await stores.sessions.create({
      id: 'valid',
      userId: user.id,
      createdAt: NOW,
      expiresAt: future,
    });
    const token = { userId: user.id, email: user.email, kind: 'verify', createdAt: NOW } as const;
    await stores.emailTokens.create({ ...token, token: 'expired', expiresAt: past });
    await stores.emailTokens.create({ ...token, token: 'valid', expiresAt: future });

    await purge.execute();

    expect(await stores.sessions.findValid('expired', past)).toBeNull();
    expect(await stores.sessions.findValid('valid', NOW)).not.toBeNull();
    expect(await stores.emailTokens.countCreatedSince(user.email, NOW)).toBe(1);
  });
});

describe('PurgeStaleAccounts report', () => {
  it('counts the erased account, whose own sessions and tokens are not counted again', async () => {
    const { storage, purge } = setup();
    await seedAccount(storage, {
      email: 'old@example.fr',
      createdAt: new Date(NOW.getTime() - 8 * DAY_MS),
    });

    expect(await purge.execute()).toEqual({
      accounts: 1,
      sessions: 0,
      emailTokens: 0,
      launches: 0,
    });
  });
});

describe('PurgeStaleAccounts launch journal', () => {
  it('drops the launches older than 24 hours and keeps the others', async () => {
    const { stores, purge } = setup();
    const create = (hoursAgo: number) =>
      stores.snapshots.create({
        projectId: 'p1',
        launchedBy: 'u1',
        pagesLimit: 10,
        startedAt: new Date(NOW.getTime() - hoursAgo * 60 * 60 * 1000),
      });
    await create(25);
    await create(23);

    const report = await purge.execute();

    expect(report.launches).toBe(1);
    expect(await stores.snapshots.countApiLaunchedSince(new Date(0))).toBe(1);
  });
});
