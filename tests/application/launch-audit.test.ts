import { describe, expect, it } from 'vitest';
import type { AuditStartRequest, StartedAudit } from '../../src/application/audit-runner.js';
import { LaunchAudit } from '../../src/application/launch-audit.js';
import type { HostResolver } from '../../src/application/ports/host-resolver.js';
import {
  AuditAlreadyRunning,
  HostNotResolved,
  InvalidAuditUrl,
  PrivateAddressRejected,
  QuotaExceeded,
  Unauthenticated,
} from '../../src/domain/errors.js';
import { ANONYMOUS_READER, type Reader } from '../../src/domain/reader.js';

const STARTED: StartedAudit = { snapshotId: 'snap-1', projectId: 'proj-1' };

const U1: Reader = { kind: 'account', userId: 'u1', isAdmin: false };
const ADMIN: Reader = { kind: 'account', userId: 'a1', isAdmin: true };

class FakeRunner {
  readonly requests: { rootUrl: string; limit: number; ownerId?: string; launchedBy?: string }[] =
    [];
  admit: (() => Promise<void>) | undefined;
  failure: Error | null = null;

  start({ admit, ...request }: AuditStartRequest): Promise<StartedAudit> {
    if (this.failure) return Promise.reject(this.failure);
    this.requests.push(request);
    this.admit = admit;
    return Promise.resolve(STARTED);
  }
}

class FakeQuota {
  readonly asked: { userId: string; isAdmin: boolean; pagesLimit: number }[] = [];
  refusal: Error | null = null;

  assertAllowed(account: { userId: string; isAdmin: boolean }, pagesLimit: number): Promise<void> {
    this.asked.push({ ...account, pagesLimit });
    return this.refusal ? Promise.reject(this.refusal) : Promise.resolve();
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
  const runner = new FakeRunner();
  const quota = new FakeQuota();
  return { runner, quota, launch: new LaunchAudit(runner, resolver, allowPrivateTargets, quota) };
};

describe('LaunchAudit', () => {
  it('starts the audit when every resolved address is public', async () => {
    const { runner, launch } = build(new FakeResolver(['93.184.216.34']));

    const started = await launch.execute(U1, { url: 'https://site.test/', limit: 100 });

    expect(started).toEqual(STARTED);
    expect(runner.requests).toEqual([
      { rootUrl: 'https://site.test/', limit: 100, ownerId: 'u1', launchedBy: 'u1' },
    ]);
  });

  it('refuses when one of several resolved addresses is internal', async () => {
    const { runner, launch } = build(new FakeResolver(['93.184.216.34', '10.0.0.1']));

    const error = await rejectionOf(launch.execute(U1, { url: 'https://site.test/', limit: 100 }));

    expect(error).toBeInstanceOf(PrivateAddressRejected);
    expect(runner.requests).toEqual([]);
  });

  it.each(['http://127.0.0.1/', 'http://[::1]/'])(
    'refuses the literal address in %s without resolving it',
    async (url) => {
      const resolver = new FakeResolver(['93.184.216.34']);
      const { runner, launch } = build(resolver);

      const error = await rejectionOf(launch.execute(U1, { url, limit: 100 }));

      expect(error).toBeInstanceOf(PrivateAddressRejected);
      expect(resolver.hosts).toEqual([]);
      expect(runner.requests).toEqual([]);
    },
  );

  it('propagates a resolution failure and starts nothing', async () => {
    const { runner, launch } = build(new FakeResolver(new HostNotResolved('site.test')));

    const error = await rejectionOf(launch.execute(U1, { url: 'https://site.test/', limit: 100 }));

    expect(error).toBeInstanceOf(HostNotResolved);
    expect(runner.requests).toEqual([]);
  });

  it('skips every address check when private targets are allowed', async () => {
    const resolver = new FakeResolver([]);
    const { runner, launch } = build(resolver, true);

    await launch.execute(U1, { url: 'http://127.0.0.1:8080/', limit: 50 });

    expect(resolver.hosts).toEqual([]);
    expect(runner.requests).toEqual([
      { rootUrl: 'http://127.0.0.1:8080/', limit: 50, ownerId: 'u1', launchedBy: 'u1' },
    ]);
  });

  it.each(['https://', 'http://:80/'])(
    'rejects the URL %s that has no host and starts nothing',
    async (url) => {
      const { runner, launch } = build(new FakeResolver(['93.184.216.34']));

      const error = await rejectionOf(launch.execute(U1, { url, limit: 100 }));

      expect(error).toBeInstanceOf(InvalidAuditUrl);
      expect(runner.requests).toEqual([]);
    },
  );

  it('lets the runner conflict through', async () => {
    const { runner, launch } = build(new FakeResolver(['93.184.216.34']));
    runner.failure = new AuditAlreadyRunning(new Date(0));

    const error = await rejectionOf(launch.execute(U1, { url: 'https://site.test/', limit: 100 }));

    expect(error).toBeInstanceOf(AuditAlreadyRunning);
  });

  it('refuses a reader without account before looking at anything else', async () => {
    const resolver = new FakeResolver(['93.184.216.34']);
    const { runner, quota, launch } = build(resolver);

    const error = await rejectionOf(
      launch.execute(ANONYMOUS_READER, { url: 'https://site.test/', limit: 100 }),
    );

    expect(error).toEqual(new Unauthenticated('no-session'));
    expect(quota.asked).toEqual([]);
    expect(resolver.hosts).toEqual([]);
    expect(runner.requests).toEqual([]);
  });

  it('checks the quota of the account before the SSRF guard and starts nothing when refused', async () => {
    const resolver = new FakeResolver(['10.0.0.1']);
    const { runner, quota, launch } = build(resolver);
    quota.refusal = new QuotaExceeded({ reason: 'global' });

    const error = await rejectionOf(
      launch.execute(ADMIN, { url: 'https://site.test/', limit: 500 }),
    );

    expect(error).toBe(quota.refusal);
    expect(quota.asked).toEqual([{ userId: 'a1', isAdmin: true, pagesLimit: 500 }]);
    expect(resolver.hosts).toEqual([]);
    expect(runner.requests).toEqual([]);
  });

  it('gives the runner the quota check to run again under its lock', async () => {
    const { runner, quota, launch } = build(new FakeResolver(['93.184.216.34']));
    await launch.execute(U1, { url: 'https://site.test/', limit: 50 });
    quota.asked.length = 0;

    await runner.admit?.();

    expect(quota.asked).toEqual([{ userId: 'u1', isAdmin: false, pagesLimit: 50 }]);
  });
});
