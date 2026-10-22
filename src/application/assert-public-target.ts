import { InvalidAuditUrl, PrivateAddressRejected } from '../domain/errors.js';
import { isIpLiteral, isPublicAddress, normalizeIpLiteral } from '../domain/network-address.js';
import type { HostResolver } from './ports/host-resolver.js';

const hostOf = (url: string): string => {
  try {
    const { hostname } = new URL(url);
    if (hostname !== '') return hostname;
  } catch {
    // an unparsable URL is reported as a domain error below
  }
  throw new InvalidAuditUrl(url);
};

/**
 * SSRF pre-check run before an audit is queued: refuses a target that is, or resolves to, a
 * non-public address. The guard at connection time stays the authority; this one fails fast.
 * It has no switch: a caller that wants to skip it simply does not call it.
 */
export class AssertPublicTarget {
  constructor(private readonly resolver: HostResolver) {}

  async execute(url: string): Promise<void> {
    const host = hostOf(url);
    const addresses = isIpLiteral(host)
      ? [normalizeIpLiteral(host)]
      : await this.resolver.resolve(host);
    const internal = addresses.find((address) => !isPublicAddress(address));
    if (internal !== undefined) throw new PrivateAddressRejected(host, internal);
  }
}
