import { AuditAlreadyQueuedForAccount, QueueFull, QuotaExceeded } from '../domain/errors.js';
import { allowanceOf, auditQuotaOf, QUOTA_WINDOW_MS } from '../domain/quota.js';
import type { AdmissionView } from './ports/audit-queue.js';
import type { Clock } from './ports/clock.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';

export interface LaunchQuotaDependencies {
  readonly snapshots: Pick<SnapshotRepository, 'listLaunchedAtBy' | 'countApiLaunchedSince'>;
  readonly clock: Clock;
  /** Ceiling of audits launched through the API per 24 hours, all accounts together. */
  readonly launchesPerDay: number;
  /** Ceiling of audits waiting in the queue, all accounts together. */
  readonly queueMax: number;
}

type QuotaView = Pick<AdmissionView, 'listLaunchedAtBy' | 'countApiLaunchedSince'>;

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
  async assertAllowed(
    account: LaunchAccount,
    pagesLimit: number,
    view: QuotaView = this.dependencies.snapshots,
  ): Promise<void> {
    const { maxPages } = allowanceOf(account.isAdmin);
    if (pagesLimit > maxPages) throw new QuotaExceeded({ reason: 'pages', maxPages });
    const { auditsRemaining, nextAuditAt } = await this.statusOf(account, view);
    if (auditsRemaining === 0 && nextAuditAt) {
      throw new QuotaExceeded({ reason: 'account', nextAvailableAt: nextAuditAt });
    }
    if (
      (await view.countApiLaunchedSince(this.windowStart())) >= this.dependencies.launchesPerDay
    ) {
      throw new QuotaExceeded({ reason: 'global' });
    }
  }

  /**
   * The rule applied inside the transaction that queues an audit: the quotas, then one audit per
   * account, then the ceiling of the queue (only the waiting audits count, not the running ones).
   */
  async assertAdmitted(
    view: AdmissionView,
    account: LaunchAccount,
    pagesLimit: number,
  ): Promise<void> {
    await this.assertAllowed(account, pagesLimit, view);
    if ((await view.countActiveFor(account.userId)) > 0) throw new AuditAlreadyQueuedForAccount();
    if ((await view.countQueued()) >= this.dependencies.queueMax) throw new QueueFull();
  }

  async statusOf(
    account: LaunchAccount,
    view: QuotaView = this.dependencies.snapshots,
  ): Promise<QuotaStatus> {
    const allowance = allowanceOf(account.isAdmin);
    const launches = await view.listLaunchedAtBy(account.userId, this.windowStart());
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
