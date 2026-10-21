import { Unauthenticated } from '../../domain/errors.js';
import type { LaunchQuota, QuotaStatus } from '../launch-quota.js';
import type { ResolveSession } from './resolve-session.js';

export interface GetCurrentAccountDependencies {
  readonly resolveSession: ResolveSession;
  readonly quota: Pick<LaunchQuota, 'statusOf'>;
  /** Normalized with `normalizeEmail`. */
  readonly adminEmails: readonly string[];
}

export interface CurrentAccount extends QuotaStatus {
  readonly email: string;
  readonly isAdmin: boolean;
}

export class GetCurrentAccount {
  constructor(private readonly dependencies: GetCurrentAccountDependencies) {}

  async execute(sessionId: string | undefined): Promise<CurrentAccount> {
    const user = await this.dependencies.resolveSession.execute(sessionId);
    if (!user) throw new Unauthenticated('no-session');
    const isAdmin = this.dependencies.adminEmails.includes(user.email);
    const quota = await this.dependencies.quota.statusOf({ userId: user.id, isAdmin });
    return { email: user.email, isAdmin, ...quota };
  }
}
