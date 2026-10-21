import { describe, expect, it } from 'vitest';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemoryUserRepository } from '../../src/infrastructure/in-memory-user-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { describeSnapshotRepositoryContract } from '../support/snapshot-repository-contract.js';

describeSnapshotRepositoryContract(() => ({
  snapshots: new InMemorySnapshotRepository(),
  projects: new InMemoryProjectRepository(),
  users: new InMemoryUserRepository(),
}));

describe('InMemorySnapshotRepository ping', () => {
  it('always resolves', async () => {
    await expect(new InMemorySnapshotRepository().ping()).resolves.toBeUndefined();
  });
});
