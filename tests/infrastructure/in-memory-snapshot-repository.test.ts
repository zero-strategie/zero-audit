import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { describeSnapshotRepositoryContract } from '../support/snapshot-repository-contract.js';

describeSnapshotRepositoryContract(() => ({
  snapshots: new InMemorySnapshotRepository(),
  projects: new InMemoryProjectRepository(),
}));
