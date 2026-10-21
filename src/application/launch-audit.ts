import { InvalidAuditUrl, PrivateAddressRejected, Unauthenticated } from '../domain/errors.js';
import { isIpLiteral, isPublicAddress, normalizeIpLiteral } from '../domain/network-address.js';
import type { Reader } from '../domain/reader.js';
import type { AuditRunner, StartedAudit } from './audit-runner.js';
import type { LaunchQuota } from './launch-quota.js';
import type { HostResolver } from './ports/host-resolver.js';

export interface LaunchAuditRequest {
  url: string;
  limit: number;
}

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
 * Identifies the account, applies its quotas, checks the target is a public site (SSRF guard),
 * then starts a background audit owned by the account.
 */
export class LaunchAudit {
  constructor(
    private readonly runner: Pick<AuditRunner, 'start'>,
    private readonly resolver: HostResolver,
    private readonly allowPrivateTargets: boolean,
    private readonly quota: Pick<LaunchQuota, 'assertAllowed'>,
  ) {}

  async execute(reader: Reader, { url, limit }: LaunchAuditRequest): Promise<StartedAudit> {
    if (reader.kind !== 'account') throw new Unauthenticated('no-session');
    const host = hostOf(url);
    const account = { userId: reader.userId, isAdmin: reader.isAdmin };
    await this.quota.assertAllowed(account, limit);
    if (!this.allowPrivateTargets) await this.assertPublicTarget(host);
    return this.runner.start({
      rootUrl: url,
      limit,
      ownerId: reader.userId,
      launchedBy: reader.userId,
      // The check above only orders the refusals; this one is atomic with the lock.
      admit: () => this.quota.assertAllowed(account, limit),
    });
  }

  private async assertPublicTarget(host: string): Promise<void> {
    const addresses = isIpLiteral(host)
      ? [normalizeIpLiteral(host)]
      : await this.resolver.resolve(host);
    const internal = addresses.find((address) => !isPublicAddress(address));
    if (internal !== undefined) throw new PrivateAddressRejected(host, internal);
  }
}
