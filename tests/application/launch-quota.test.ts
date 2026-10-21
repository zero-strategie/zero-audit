import { describe, expect, it } from 'vitest';
import { LaunchQuota } from '../../src/application/launch-quota.js';
import { QuotaExceeded } from '../../src/domain/errors.js';
import { QUOTA_WINDOW_MS } from '../../src/domain/quota.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { MutableClock, NOW } from '../support/auth-doubles.js';

const HOUR_MS = 60 * 60 * 1000;
const FREE = { userId: 'u1', isAdmin: false };
const ADMIN = { userId: 'a1', isAdmin: true };

const build = (launchesPerDay = 30) => {
  const clock = new MutableClock();
  const snapshots = new InMemorySnapshotRepository();
  const quota = new LaunchQuota({ snapshots, clock, launchesPerDay });
  const launch = (launchedBy: string | null, hoursAgo: number) =>
    snapshots.create({
      projectId: 'p1',
      launchedBy,
      pagesLimit: 10,
      startedAt: new Date(NOW.getTime() - hoursAgo * HOUR_MS),
    });
  return { clock, quota, launch };
};

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  return undefined;
};

describe('LaunchQuota.assertAllowed', () => {
  it('refuses more pages than the account allows, whatever its quota', async () => {
    const { quota } = build();

    const free = await rejectionOf(quota.assertAllowed(FREE, 250));
    const admin = await rejectionOf(quota.assertAllowed(ADMIN, 1000));

    expect(free).toEqual(new QuotaExceeded({ reason: 'pages', maxPages: 100 }));
    expect(admin).toEqual(new QuotaExceeded({ reason: 'pages', maxPages: 500 }));
  });

  it('accepts exactly the allowed number of pages', async () => {
    const { quota } = build();

    await expect(quota.assertAllowed(FREE, 100)).resolves.toBeUndefined();
    await expect(quota.assertAllowed(ADMIN, 500)).resolves.toBeUndefined();
  });

  it('refuses a fourth audit in 24 hours with the time of the next possible one', async () => {
    const { quota, launch } = build();
    await launch('u1', 20);
    await launch('u1', 10);
    await launch('u1', 1);

    const error = await rejectionOf(quota.assertAllowed(FREE, 50));

    expect(error).toEqual(
      new QuotaExceeded({
        reason: 'account',
        nextAvailableAt: new Date(NOW.getTime() - 20 * HOUR_MS + QUOTA_WINDOW_MS),
      }),
    );
  });

  it('accepts again once the oldest launch is 24 hours old', async () => {
    const { quota, launch, clock } = build();
    await launch('u1', 20);
    await launch('u1', 10);
    await launch('u1', 1);
    clock.advance(4 * HOUR_MS + 1);

    await expect(quota.assertAllowed(FREE, 50)).resolves.toBeUndefined();
  });

  it('ignores the launches of other accounts and of the command line', async () => {
    const { quota, launch } = build();
    await launch('other', 1);
    await launch('other', 2);
    await launch(null, 3);

    await expect(quota.assertAllowed(FREE, 50)).resolves.toBeUndefined();
  });

  it('never applies the personal quota to an administrator', async () => {
    const { quota, launch } = build();
    for (const hoursAgo of [1, 2, 3]) await launch('a1', hoursAgo);

    await expect(quota.assertAllowed(ADMIN, 500)).resolves.toBeUndefined();
  });

  it('refuses everybody, administrators included, once the daily ceiling is reached by API launches', async () => {
    const { quota, launch } = build(3);
    await launch('x', 1);
    await launch('y', 2);
    await launch('z', 3);
    await launch(null, 4);

    expect(await rejectionOf(quota.assertAllowed(FREE, 50))).toEqual(
      new QuotaExceeded({ reason: 'global' }),
    );
    expect(await rejectionOf(quota.assertAllowed(ADMIN, 50))).toEqual(
      new QuotaExceeded({ reason: 'global' }),
    );
  });

  it('does not count the command line against the ceiling', async () => {
    const { quota, launch } = build(2);
    await launch('x', 1);
    await launch(null, 2);
    await launch(null, 3);

    await expect(quota.assertAllowed(ADMIN, 50)).resolves.toBeUndefined();
  });
});

describe('LaunchQuota.statusOf', () => {
  it('tells a free account its page ceiling and the audits it has left', async () => {
    const { quota, launch } = build();
    await launch('u1', 1);

    expect(await quota.statusOf(FREE)).toEqual({
      pagesLimitMax: 100,
      auditsRemaining: 2,
      nextAuditAt: null,
    });
  });

  it('gives the next audit date once the quota is spent', async () => {
    const { quota, launch } = build();
    for (const hoursAgo of [20, 10, 1]) await launch('u1', hoursAgo);

    expect(await quota.statusOf(FREE)).toEqual({
      pagesLimitMax: 100,
      auditsRemaining: 0,
      nextAuditAt: new Date(NOW.getTime() - 20 * HOUR_MS + QUOTA_WINDOW_MS),
    });
  });

  it('gives an administrator 500 pages and no personal quota', async () => {
    const { quota } = build();

    expect(await quota.statusOf(ADMIN)).toEqual({
      pagesLimitMax: 500,
      auditsRemaining: null,
      nextAuditAt: null,
    });
  });
});
