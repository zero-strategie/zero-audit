import { AuditInProgress, Unauthenticated } from '../../domain/errors.js';
import { ORPHAN_AUDIT_MAX_AGE_MS } from '../../domain/snapshot.js';
import type { AccountEraser } from '../ports/account-eraser.js';
import type { Clock } from '../ports/clock.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { SnapshotRepository } from '../ports/snapshot-repository.js';
import type { ResolveSession } from './resolve-session.js';

export interface DeleteAccountDependencies {
  readonly resolveSession: ResolveSession;
  readonly passwordHasher: PasswordHasher;
  readonly projects: ProjectRepository;
  readonly snapshots: SnapshotRepository;
  readonly eraser: AccountEraser;
  readonly clock: Clock;
}

export class DeleteAccount {
  constructor(private readonly dependencies: DeleteAccountDependencies) {}

  /**
   * Right to erasure. The password is asked again so that a stolen session cannot destroy the
   * account, and a running audit blocks the erasure because it would keep writing to erased rows.
   */
  async execute({
    sessionId,
    password,
  }: {
    sessionId: string | undefined;
    password: string;
  }): Promise<void> {
    const { resolveSession, passwordHasher, eraser } = this.dependencies;
    const user = await resolveSession.execute(sessionId);
    if (!user) throw new Unauthenticated('no-session');
    if (!(await passwordHasher.verify(password, user.passwordHash))) throw new Unauthenticated();
    if (await this.hasRunningAudit(user.id)) throw new AuditInProgress();
    await eraser.eraseAccount(user.id);
  }

  private async hasRunningAudit(userId: string): Promise<boolean> {
    const { projects, snapshots, clock } = this.dependencies;
    const ownedIds = new Set(
      (await projects.list(userId)).filter(({ ownerId }) => ownerId === userId).map(({ id }) => id),
    );
    const orphanLimit = clock.now() - ORPHAN_AUDIT_MAX_AGE_MS;
    const running = await snapshots.listRunning();
    return running.some(
      ({ projectId, startedAt }) => ownedIds.has(projectId) && startedAt.getTime() > orphanLimit,
    );
  }
}
