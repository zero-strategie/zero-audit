import { describe, expect, it } from 'vitest';
import { HostNotResolved } from '../../src/domain/errors.js';
import { DnsHostResolver, type DnsLookup } from '../../src/infrastructure/dns-host-resolver.js';

const dnsError = (code: string): Error => Object.assign(new Error(code), { code });

describe('DnsHostResolver', () => {
  it('returns every address found for the host', async () => {
    const lookup: DnsLookup = (host) =>
      Promise.resolve(
        host === 'site.test'
          ? [
              { address: '93.184.216.34', family: 4 },
              { address: '2001:db8::1', family: 6 },
            ]
          : [],
      );

    expect(await new DnsHostResolver(lookup).resolve('site.test')).toEqual([
      '93.184.216.34',
      '2001:db8::1',
    ]);
  });

  it.each(['ENOTFOUND', 'ENODATA', 'EAI_AGAIN'])(
    'turns the %s lookup failure into HostNotResolved',
    async (code) => {
      const resolver = new DnsHostResolver(() => Promise.reject(dnsError(code)));

      await expect(resolver.resolve('site.test')).rejects.toBeInstanceOf(HostNotResolved);
    },
  );

  it('rejects with HostNotResolved when the lookup returns no address', async () => {
    const resolver = new DnsHostResolver(() => Promise.resolve([]));

    await expect(resolver.resolve('site.test')).rejects.toBeInstanceOf(HostNotResolved);
  });

  it('does not hide unexpected failures', async () => {
    const resolver = new DnsHostResolver(() => Promise.reject(new Error('boom')));

    await expect(resolver.resolve('site.test')).rejects.toThrow('boom');
  });
});
