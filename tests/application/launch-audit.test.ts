import { describe, expect, it } from 'vitest';
import type { StartedAudit } from '../../src/application/audit-runner.js';
import { LaunchAudit } from '../../src/application/launch-audit.js';
import type { HostResolver } from '../../src/application/ports/host-resolver.js';
import {
  AuditAlreadyRunning,
  HostNotResolved,
  PrivateAddressRejected,
} from '../../src/domain/errors.js';

const STARTED: StartedAudit = { snapshotId: 'snap-1', projectId: 'proj-1' };

class FakeRunner {
  readonly requests: { rootUrl: string; limit: number }[] = [];
  failure: Error | null = null;

  start(request: { rootUrl: string; limit: number }): Promise<StartedAudit> {
    if (this.failure) return Promise.reject(this.failure);
    this.requests.push(request);
    return Promise.resolve(STARTED);
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
  return { runner, launch: new LaunchAudit(runner, resolver, allowPrivateTargets) };
};

describe('LaunchAudit', () => {
  it('starts the audit when every resolved address is public', async () => {
    const { runner, launch } = build(new FakeResolver(['93.184.216.34']));

    const started = await launch.execute({ url: 'https://site.test/', limit: 100 });

    expect(started).toEqual(STARTED);
    expect(runner.requests).toEqual([{ rootUrl: 'https://site.test/', limit: 100 }]);
  });

  it('refuses when one of several resolved addresses is internal', async () => {
    const { runner, launch } = build(new FakeResolver(['93.184.216.34', '10.0.0.1']));

    const error = await rejectionOf(launch.execute({ url: 'https://site.test/', limit: 100 }));

    expect(error).toBeInstanceOf(PrivateAddressRejected);
    expect(runner.requests).toEqual([]);
  });

  it.each(['http://127.0.0.1/', 'http://[::1]/'])(
    'refuses the literal address in %s without resolving it',
    async (url) => {
      const resolver = new FakeResolver(['93.184.216.34']);
      const { runner, launch } = build(resolver);

      const error = await rejectionOf(launch.execute({ url, limit: 100 }));

      expect(error).toBeInstanceOf(PrivateAddressRejected);
      expect(resolver.hosts).toEqual([]);
      expect(runner.requests).toEqual([]);
    },
  );

  it('propagates a resolution failure and starts nothing', async () => {
    const { runner, launch } = build(new FakeResolver(new HostNotResolved('site.test')));

    const error = await rejectionOf(launch.execute({ url: 'https://site.test/', limit: 100 }));

    expect(error).toBeInstanceOf(HostNotResolved);
    expect(runner.requests).toEqual([]);
  });

  it('skips every address check when private targets are allowed', async () => {
    const resolver = new FakeResolver([]);
    const { runner, launch } = build(resolver, true);

    await launch.execute({ url: 'http://127.0.0.1:8080/', limit: 50 });

    expect(resolver.hosts).toEqual([]);
    expect(runner.requests).toEqual([{ rootUrl: 'http://127.0.0.1:8080/', limit: 50 }]);
  });

  it('lets the runner conflict through', async () => {
    const { runner, launch } = build(new FakeResolver(['93.184.216.34']));
    runner.failure = new AuditAlreadyRunning(new Date(0));

    const error = await rejectionOf(launch.execute({ url: 'https://site.test/', limit: 100 }));

    expect(error).toBeInstanceOf(AuditAlreadyRunning);
  });
});
