import { LOGIN_FAILURES_PER_ACCOUNT, LOGIN_WINDOW_MS } from '../../domain/abuse-limits.js';
import { AuditInProgress, TooManyAttempts, Unauthenticated } from '../../domain/errors.js';
import { HEARTBEAT_STALE_MS, type Snapshot } from '../../domain/snapshot.js';
import { LEGACY_ORPHAN_AGE_MS } from '../legacy-orphan-age.js';
import type { AccountEraser } from '../ports/account-eraser.js';
import type { Clock } from '../ports/clock.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { RateLimiter } from '../ports/rate-limiter.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { SnapshotRepository } from '../ports/snapshot-repository.js';
import type { ResolveSession } from './resolve-session.js';

export interface DeleteAccountDependencies {
  readonly resolveSession: ResolveSession;
  readonly passwordHasher: PasswordHasher;
  readonly projects: ProjectRepository;
  readonly snapshots: SnapshotRepository;
  readonly eraser: AccountEraser;
  readonly rateLimiter: RateLimiter;
  readonly clock: Clock;
}

export class DeleteAccount {
  constructor(private readonly dependencies: DeleteAccountDependencies) {}

  /**
   * Right to erasure. The password is asked again so that a stolen session cannot destroy the
   * account (wrong attempts share the budget of the login), and a queued or live audit blocks the erasure because the worker would keep writing to erased rows.
   */
  async execute({
    sessionId,
    password,
  }: {
    sessionId: string | undefined;
    password: string;
  }): Promise<void> {
    const { resolveSession, passwordHasher, eraser, rateLimiter } = this.dependencies;
    const user = await resolveSession.execute(sessionId);
    if (!user) throw new Unauthenticated('no-session');
    const accountKey = `login-account:${user.email}`;
    if (rateLimiter.isBlocked(accountKey, LOGIN_FAILURES_PER_ACCOUNT, LOGIN_WINDOW_MS)) {
      throw new TooManyAttempts();
    }
    if (!(await passwordHasher.verify(password, user.passwordHash))) {
      rateLimiter.hit(accountKey, LOGIN_WINDOW_MS);
      throw new Unauthenticated();
    }
    if (await this.hasRunningAudit(user.id)) throw new AuditInProgress();
    await eraser.eraseAccount(user.id);
  }

  /** A queued audit counts; a running one only while its worker is alive (fresh heartbeat). */
  private async hasRunningAudit(userId: string): Promise<boolean> {
    const { projects, snapshots, clock } = this.dependencies;
    const owned = (await projects.list(userId)).filter(({ ownerId }) => ownerId === userId);
    const now = clock.now();
    for (const { id } of owned) {
      const audits = await snapshots.listByProject(id);
      if (audits.some((audit) => isInProgress(audit, now))) return true;
    }
    return false;
  }
}

const isInProgress = (audit: Snapshot, now: number): boolean => {
  if (audit.status === 'queued') return true;
  if (audit.status !== 'running') return false;
  if (audit.heartbeatAt === null) return now - audit.startedAt.getTime() < LEGACY_ORPHAN_AGE_MS;
  return now - audit.heartbeatAt.getTime() < HEARTBEAT_STALE_MS;
};
