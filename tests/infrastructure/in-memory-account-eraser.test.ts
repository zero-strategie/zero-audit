import { InMemoryAccountEraser } from '../../src/infrastructure/in-memory-account-eraser.js';
import { InMemoryEmailTokenRepository } from '../../src/infrastructure/in-memory-email-token-repository.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySessionRepository } from '../../src/infrastructure/in-memory-session-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { InMemoryUserRepository } from '../../src/infrastructure/in-memory-user-repository.js';
import { describeAccountEraserContract } from '../support/account-eraser-contract.js';

describeAccountEraserContract(() => {
  const users = new InMemoryUserRepository();
  const stores = {
    users,
    projects: new InMemoryProjectRepository(),
    snapshots: new InMemorySnapshotRepository(
      async (id) => (await users.findById(id))?.email ?? null,
    ),
    sessions: new InMemorySessionRepository(),
    emailTokens: new InMemoryEmailTokenRepository(),
  };
  return { ...stores, eraser: new InMemoryAccountEraser(stores) };
});
