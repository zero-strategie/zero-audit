import { describe, expect, it } from 'vitest';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { inMemoryLegacyAccounts } from '../support/legacy-accounts.js';
import { describeSnapshotRepositoryContract } from '../support/snapshot-repository-contract.js';

describeSnapshotRepositoryContract(() => {
  const accounts = inMemoryLegacyAccounts();
  return {
    snapshots: new InMemorySnapshotRepository((id) => accounts.emailOf(id)),
    projects: new InMemoryProjectRepository(),
    accounts,
  };
});

describe('InMemorySnapshotRepository ping', () => {
  it('always resolves', async () => {
    await expect(new InMemorySnapshotRepository().ping()).resolves.toBeUndefined();
  });
});
