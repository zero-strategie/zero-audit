import { InvalidAuditUrl, PrivateAddressRejected, Unauthenticated } from '../domain/errors.js';
import { isIpLiteral, isPublicAddress, normalizeIpLiteral } from '../domain/network-address.js';
import type { Reader } from '../domain/reader.js';
import { normalizeUrl } from '../domain/url.js';
import type { AdmissionView, AuditQueue } from './ports/audit-queue.js';
import type { Clock } from './ports/clock.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { LaunchQuota } from './launch-quota.js';
import type { HostResolver } from './ports/host-resolver.js';

export interface StartedAudit {
  snapshotId: string;
  projectId: string;
}

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
 * then puts the audit in the queue; a worker crawls it later.
 */
export class LaunchAudit {
  constructor(
    private readonly queue: Pick<AuditQueue, 'enqueue'> & AdmissionView,
    private readonly projects: Pick<ProjectRepository, 'findOrCreateByRootUrl'>,
    private readonly resolver: HostResolver,
    private readonly allowPrivateTargets: boolean,
    private readonly quota: Pick<LaunchQuota, 'assertAllowed' | 'assertAdmitted'>,
    private readonly clock: Clock,
  ) {}

  async execute(reader: Reader, { url, limit }: LaunchAuditRequest): Promise<StartedAudit> {
    if (reader.kind !== 'account') throw new Unauthenticated('no-session');
    const host = hostOf(url);
    const account = { userId: reader.userId, isAdmin: reader.isAdmin };
    await this.quota.assertAllowed(account, limit);
    if (!this.allowPrivateTargets) await this.assertPublicTarget(host);
    // Refused before any project is created, so a refusal leaves nothing behind.
    await this.quota.assertAdmitted(this.queue, account, limit);
    const requestedAt = new Date(this.clock.now());
    const project = await this.projects.findOrCreateByRootUrl({
      rootUrl: normalizeUrl(url),
      ownerId: reader.userId,
      createdAt: requestedAt,
    });
    // The checks above only order the refusals; the admission is atomic with the insertion.
    const snapshot = await this.queue.enqueue(
      { projectId: project.id, launchedBy: reader.userId, pagesLimit: limit, requestedAt },
      (view) => this.quota.assertAdmitted(view, account, limit),
    );
    return { snapshotId: snapshot.id, projectId: project.id };
  }

  private async assertPublicTarget(host: string): Promise<void> {
    const addresses = isIpLiteral(host)
      ? [normalizeIpLiteral(host)]
      : await this.resolver.resolve(host);
    const internal = addresses.find((address) => !isPublicAddress(address));
    if (internal !== undefined) throw new PrivateAddressRejected(host, internal);
  }
}
