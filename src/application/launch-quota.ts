import { QuotaExceeded } from '../domain/errors.js';
import { allowanceOf, auditQuotaOf, QUOTA_WINDOW_MS } from '../domain/quota.js';
import type { Clock } from './ports/clock.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';

export interface LaunchQuotaDependencies {
  readonly snapshots: Pick<SnapshotRepository, 'listLaunchedAtBy' | 'countApiLaunchedSince'>;
  readonly clock: Clock;
  /** Ceiling of audits launched through the API per 24 hours, all accounts together. */
  readonly launchesPerDay: number;
}

export interface LaunchAccount {
  readonly userId: string;
  readonly isAdmin: boolean;
}

export interface QuotaStatus {
  readonly pagesLimitMax: number;
  readonly auditsRemaining: number | null;
  readonly nextAuditAt: Date | null;
}

/** Decides whether an account may launch an audit now; counts snapshots, so refusals cost nothing. */
export class LaunchQuota {
  constructor(private readonly dependencies: LaunchQuotaDependencies) {}

  /** Checks, in this order, the page ceiling, the personal quota, then the global ceiling. */
  async assertAllowed(account: LaunchAccount, pagesLimit: number): Promise<void> {
    const { maxPages } = allowanceOf(account.isAdmin);
    if (pagesLimit > maxPages) throw new QuotaExceeded({ reason: 'pages', maxPages });
    const { auditsRemaining, nextAuditAt } = await this.statusOf(account);
    if (auditsRemaining === 0 && nextAuditAt) {
      throw new QuotaExceeded({ reason: 'account', nextAvailableAt: nextAuditAt });
    }
    const { snapshots, launchesPerDay } = this.dependencies;
    if ((await snapshots.countApiLaunchedSince(this.windowStart())) >= launchesPerDay) {
      throw new QuotaExceeded({ reason: 'global' });
    }
  }

  async statusOf(account: LaunchAccount): Promise<QuotaStatus> {
    const allowance = allowanceOf(account.isAdmin);
    const launches = await this.dependencies.snapshots.listLaunchedAtBy(
      account.userId,
      this.windowStart(),
    );
    const { remaining, nextAvailableAt } = auditQuotaOf(allowance, launches);
    return {
      pagesLimitMax: allowance.maxPages,
      auditsRemaining: remaining,
      nextAuditAt: nextAvailableAt,
    };
  }

  private windowStart(): Date {
    return new Date(this.dependencies.clock.now() - QUOTA_WINDOW_MS);
  }
}
