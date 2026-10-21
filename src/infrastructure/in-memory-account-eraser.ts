import type { AccountEraser } from '../application/ports/account-eraser.js';
import type { SessionRepository } from '../application/ports/session-repository.js';
import type { InMemoryEmailTokenRepository } from './in-memory-email-token-repository.js';
import type { InMemoryProjectRepository } from './in-memory-project-repository.js';
import type { InMemorySnapshotRepository } from './in-memory-snapshot-repository.js';
import type { InMemoryUserRepository } from './in-memory-user-repository.js';

export interface InMemoryAccountStores {
  readonly users: InMemoryUserRepository;
  readonly projects: InMemoryProjectRepository;
  readonly snapshots: InMemorySnapshotRepository;
  readonly sessions: SessionRepository;
  readonly emailTokens: InMemoryEmailTokenRepository;
}

export class InMemoryAccountEraser implements AccountEraser {
  constructor(private readonly stores: InMemoryAccountStores) {}

  async eraseAccount(userId: string): Promise<void> {
    const { users, projects, snapshots, sessions, emailTokens } = this.stores;
    snapshots.eraseOfProjects(projects.eraseOwnedBy(userId));
    await sessions.deleteAllForUser(userId);
    emailTokens.eraseForUser(userId);
    users.eraseUser(userId);
  }

  purgeLaunchesBefore(date: Date): Promise<number> {
    return Promise.resolve(this.stores.snapshots.purgeLaunchesBefore(date));
  }

  async purgeUnverifiedBefore(date: Date): Promise<number> {
    const doomed = this.stores.users.unverifiedCreatedBefore(date);
    for (const { id } of doomed) await this.eraseAccount(id);
    return doomed.length;
  }
}
