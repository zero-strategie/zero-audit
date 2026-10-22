import { UNVERIFIED_ACCOUNT_TTL_MS } from '../domain/user.js';
import type { AccountEraser } from './ports/account-eraser.js';
import type { Clock } from './ports/clock.js';
import type { EmailTokenRepository } from './ports/email-token-repository.js';
import type { SessionRepository } from './ports/session-repository.js';

/** The launch journal only matters over the 24 hours the quotas of the hosted product look back. */
const LAUNCH_JOURNAL_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface PurgeStaleAccountsDependencies {
  readonly eraser: AccountEraser;
  readonly sessions: SessionRepository;
  readonly emailTokens: EmailTokenRepository;
  readonly clock: Clock;
}

export interface PurgeReport {
  readonly accounts: number;
  readonly sessions: number;
  readonly emailTokens: number;
  /** Journal entries older than the quota window, now useless. */
  readonly launches: number;
}

export class PurgeStaleAccounts {
  constructor(private readonly dependencies: PurgeStaleAccountsDependencies) {}

  async execute(): Promise<PurgeReport> {
    const { eraser, sessions, emailTokens, clock } = this.dependencies;
    const now = new Date(clock.now());
    const accounts = await eraser.purgeUnverifiedBefore(
      new Date(now.getTime() - UNVERIFIED_ACCOUNT_TTL_MS),
    );
    return {
      accounts,
      sessions: await sessions.deleteExpired(now),
      emailTokens: await emailTokens.deleteExpired(now),
      launches: await eraser.purgeLaunchesBefore(
        new Date(now.getTime() - LAUNCH_JOURNAL_RETENTION_MS),
      ),
    };
  }
}
