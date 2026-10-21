import { describe, expect, it } from 'vitest';
import { LaunchAudit } from '../../src/application/launch-audit.js';
import type { AdmissionView } from '../../src/application/ports/audit-queue.js';
import type { HostResolver } from '../../src/application/ports/host-resolver.js';
import {
  AuditAlreadyQueuedForAccount,
  HostNotResolved,
  InvalidAuditUrl,
  PrivateAddressRejected,
  QuotaExceeded,
  Unauthenticated,
} from '../../src/domain/errors.js';
import { ANONYMOUS_READER, type Reader } from '../../src/domain/reader.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { MutableClock, NOW } from '../support/auth-doubles.js';

const U1: Reader = { kind: 'account', userId: 'u1', isAdmin: false };
const ADMIN: Reader = { kind: 'account', userId: 'a1', isAdmin: true };

class FakeQuota {
  readonly asked: { userId: string; isAdmin: boolean; pagesLimit: number }[] = [];
  readonly admitted: { userId: string; view: AdmissionView }[] = [];
  refusal: Error | null = null;
  admissionRefusal: Error | null = null;

  assertAllowed(account: { userId: string; isAdmin: boolean }, pagesLimit: number): Promise<void> {
    this.asked.push({ ...account, pagesLimit });
    return this.refusal ? Promise.reject(this.refusal) : Promise.resolve();
  }

  assertAdmitted(view: AdmissionView, account: { userId: string }): Promise<void> {
    this.admitted.push({ userId: account.userId, view });
    return this.admissionRefusal ? Promise.reject(this.admissionRefusal) : Promise.resolve();
  }
}

class FakeResolver implements HostResolver {
  readonly hosts: string[] = [];
  constructor(private readonly outcome: string[] | Error) {}

  resolve(host: string): Promise<string[]> {
    this.hosts.push(host);
    return this.outcome instanceof Error
      ? Promise.reject(this.outcome)
      : Promise.resolve(this.outcome);
  }
}

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  return undefined;
};

const build = (resolver: FakeResolver, allowPrivateTargets = false) => {
  const snapshots = new InMemorySnapshotRepository();
  const projects = new InMemoryProjectRepository();
  const quota = new FakeQuota();
  const launch = new LaunchAudit(
    snapshots,
    projects,
    resolver,
    allowPrivateTargets,
    quota,
    new MutableClock(),
  );
  const queued = async () => {
    const all = [];
    for (
      let next = await snapshots.claimNext('probe', NOW);
      next;
      next = await snapshots.claimNext('probe', NOW)
    ) {
      all.push(next);
    }
    return all;
  };
  return { snapshots, projects, quota, launch, queued };
};

describe('LaunchAudit', () => {
  it('queues the audit of a normalized root url, owned and launched by the account', async () => {
    const { snapshots, projects, launch } = build(new FakeResolver(['93.184.216.34']));

    const started = await launch.execute(U1, { url: 'https://site.test/#top', limit: 100 });

    const details = await snapshots.getById(started.snapshotId);
    expect(details?.snapshot).toMatchObject({
      status: 'queued',
      pagesLimit: 100,
      projectId: started.projectId,
      startedAt: NOW,
    });
    expect(await projects.getById(started.projectId)).toMatchObject({
      rootUrl: 'https://site.test/',
      ownerId: 'u1',
    });
    expect(await snapshots.countApiLaunchedSince(new Date(0))).toBe(1);
    expect(await snapshots.countActiveFor('u1')).toBe(1);
  });

  it('refuses when one of several resolved addresses is internal', async () => {
    const { queued, launch } = build(new FakeResolver(['93.184.216.34', '10.0.0.1']));

    const error = await rejectionOf(launch.execute(U1, { url: 'https://site.test/', limit: 100 }));

    expect(error).toBeInstanceOf(PrivateAddressRejected);
    expect(await queued()).toEqual([]);
  });

  it.each(['http://127.0.0.1/', 'http://[::1]/'])(
    'refuses the literal address in %s without resolving it',
    async (url) => {
      const resolver = new FakeResolver(['93.184.216.34']);
      const { queued, launch } = build(resolver);

      const error = await rejectionOf(launch.execute(U1, { url, limit: 100 }));

      expect(error).toBeInstanceOf(PrivateAddressRejected);
      expect(resolver.hosts).toEqual([]);
      expect(await queued()).toEqual([]);
    },
  );

  it('propagates a resolution failure and queues nothing', async () => {
    const { queued, launch } = build(new FakeResolver(new HostNotResolved('site.test')));

    const error = await rejectionOf(launch.execute(U1, { url: 'https://site.test/', limit: 100 }));

    expect(error).toBeInstanceOf(HostNotResolved);
    expect(await queued()).toEqual([]);
  });

  it('skips every address check when private targets are allowed', async () => {
    const resolver = new FakeResolver([]);
    const { snapshots, launch } = build(resolver, true);

    const started = await launch.execute(U1, { url: 'http://127.0.0.1:8080/', limit: 50 });

    expect(resolver.hosts).toEqual([]);
    expect((await snapshots.getById(started.snapshotId))?.snapshot.pagesLimit).toBe(50);
  });

  it.each(['https://', 'http://:80/'])(
    'rejects the URL %s that has no host and queues nothing',
    async (url) => {
      const { queued, launch } = build(new FakeResolver(['93.184.216.34']));

      const error = await rejectionOf(launch.execute(U1, { url, limit: 100 }));

      expect(error).toBeInstanceOf(InvalidAuditUrl);
      expect(await queued()).toEqual([]);
    },
  );

  it('lets the admission refusal through and records no snapshot', async () => {
    const { quota, queued, snapshots, launch } = build(new FakeResolver(['93.184.216.34']));
    quota.admissionRefusal = new AuditAlreadyQueuedForAccount();

    const error = await rejectionOf(launch.execute(U1, { url: 'https://site.test/', limit: 100 }));

    expect(error).toBeInstanceOf(AuditAlreadyQueuedForAccount);
    expect(quota.admitted).toEqual([{ userId: 'u1', view: snapshots }]);
    expect(await queued()).toEqual([]);
  });

  it('refuses a reader without account before looking at anything else', async () => {
    const resolver = new FakeResolver(['93.184.216.34']);
    const { quota, queued, launch } = build(resolver);

    const error = await rejectionOf(
      launch.execute(ANONYMOUS_READER, { url: 'https://site.test/', limit: 100 }),
    );

    expect(error).toEqual(new Unauthenticated('no-session'));
    expect(quota.asked).toEqual([]);
    expect(resolver.hosts).toEqual([]);
    expect(await queued()).toEqual([]);
  });

  it('checks the quota of the account before the SSRF guard and queues nothing when refused', async () => {
    const resolver = new FakeResolver(['10.0.0.1']);
    const { quota, queued, launch } = build(resolver);
    quota.refusal = new QuotaExceeded({ reason: 'global' });

    const error = await rejectionOf(
      launch.execute(ADMIN, { url: 'https://site.test/', limit: 500 }),
    );

    expect(error).toBe(quota.refusal);
    expect(quota.asked).toEqual([{ userId: 'a1', isAdmin: true, pagesLimit: 500 }]);
    expect(resolver.hosts).toEqual([]);
    expect(await queued()).toEqual([]);
  });
});
