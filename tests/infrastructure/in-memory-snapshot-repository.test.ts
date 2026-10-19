import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { describeSnapshotRepositoryContract } from '../support/snapshot-repository-contract.js';

describeSnapshotRepositoryContract(() => new InMemorySnapshotRepository());
