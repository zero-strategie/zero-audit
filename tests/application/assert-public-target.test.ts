import { describe, expect, it } from 'vitest';
import { AssertPublicTarget } from '../../src/application/assert-public-target.js';
import type { HostResolver } from '../../src/application/ports/host-resolver.js';
import {
  HostNotResolved,
  InvalidAuditUrl,
  PrivateAddressRejected,
} from '../../src/domain/errors.js';

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

describe('AssertPublicTarget', () => {
  it('refuses a host resolved to a private address, naming the host and the address', async () => {
    const guard = new AssertPublicTarget(new FakeResolver(['10.0.0.5']));

    const error = await rejectionOf(guard.execute('https://intranet.example/'));

    expect(error).toEqual(new PrivateAddressRejected('intranet.example', '10.0.0.5'));
  });

  it.each(['http://127.0.0.1:8080/', 'http://[::1]/'])(
    'refuses the literal address in %s without resolving it',
    async (url) => {
      const resolver = new FakeResolver(['93.184.216.34']);

      const error = await rejectionOf(new AssertPublicTarget(resolver).execute(url));

      expect(error).toBeInstanceOf(PrivateAddressRejected);
      expect(resolver.hosts).toEqual([]);
    },
  );

  it('refuses an IPv4-mapped IPv6 literal with the normalized address', async () => {
    const guard = new AssertPublicTarget(new FakeResolver([]));

    const error = await rejectionOf(guard.execute('http://[::ffff:192.168.1.1]/'));

    expect(error).toBeInstanceOf(PrivateAddressRejected);
    expect((error as PrivateAddressRejected).address).toBe('::ffff:c0a8:101');
  });

  it('refuses when one of several resolved addresses is internal', async () => {
    const guard = new AssertPublicTarget(new FakeResolver(['93.184.216.34', '10.0.0.1']));

    const error = await rejectionOf(guard.execute('https://site.test/'));

    expect(error).toEqual(new PrivateAddressRejected('site.test', '10.0.0.1'));
  });

  it('accepts a host resolved only to public addresses', async () => {
    const guard = new AssertPublicTarget(new FakeResolver(['93.184.216.34']));

    await expect(guard.execute('https://site.test/')).resolves.toBeUndefined();
  });

  it.each(['pas-une-url', 'https://', 'http://:80/'])(
    'rejects the input %s as an invalid audit URL',
    async (url) => {
      const guard = new AssertPublicTarget(new FakeResolver(['93.184.216.34']));

      expect(await rejectionOf(guard.execute(url))).toBeInstanceOf(InvalidAuditUrl);
    },
  );

  it('propagates a resolution failure as is', async () => {
    const failure = new HostNotResolved('site.test');
    const guard = new AssertPublicTarget(new FakeResolver(failure));

    expect(await rejectionOf(guard.execute('https://site.test/'))).toBe(failure);
  });
});
