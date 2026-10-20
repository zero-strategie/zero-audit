import { PrivateAddressRejected } from '../domain/errors.js';
import { isIpLiteral, isPublicAddress, normalizeIpLiteral } from '../domain/network-address.js';
import type { AuditRunner, StartedAudit } from './audit-runner.js';
import type { HostResolver } from './ports/host-resolver.js';

export interface LaunchAuditRequest {
  url: string;
  limit: number;
}

/** Checks the target is a public site (SSRF guard), then starts a background audit. */
export class LaunchAudit {
  constructor(
    private readonly runner: Pick<AuditRunner, 'start'>,
    private readonly resolver: HostResolver,
    private readonly allowPrivateTargets: boolean,
  ) {}

  async execute({ url, limit }: LaunchAuditRequest): Promise<StartedAudit> {
    if (!this.allowPrivateTargets) await this.assertPublicTarget(new URL(url).hostname);
    return this.runner.start({ rootUrl: url, limit });
  }

  private async assertPublicTarget(host: string): Promise<void> {
    const addresses = isIpLiteral(host)
      ? [normalizeIpLiteral(host)]
      : await this.resolver.resolve(host);
    const internal = addresses.find((address) => !isPublicAddress(address));
    if (internal !== undefined) throw new PrivateAddressRejected(host, internal);
  }
}
