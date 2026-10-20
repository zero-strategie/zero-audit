import { lookup } from 'node:dns/promises';
import type { HostResolver } from '../application/ports/host-resolver.js';
import { HostNotResolved } from '../domain/errors.js';

export type DnsLookup = (host: string) => Promise<{ address: string; family: number }[]>;

const NOT_RESOLVED_CODES = new Set(['ENOTFOUND', 'ENODATA', 'EAI_AGAIN']);

const systemLookup: DnsLookup = (host) => lookup(host, { all: true });

const isNotResolvedFailure = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && NOT_RESOLVED_CODES.has(String(error.code));

export class DnsHostResolver implements HostResolver {
  constructor(private readonly dnsLookup: DnsLookup = systemLookup) {}

  async resolve(host: string): Promise<string[]> {
    try {
      const entries = await this.dnsLookup(host);
      if (entries.length === 0) throw new HostNotResolved(host);
      return entries.map((entry) => entry.address);
    } catch (error) {
      if (isNotResolvedFailure(error)) throw new HostNotResolved(host);
      throw error;
    }
  }
}
