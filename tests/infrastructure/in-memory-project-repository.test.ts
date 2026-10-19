import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { describeProjectRepositoryContract } from '../support/project-repository-contract.js';

describeProjectRepositoryContract(() => new InMemoryProjectRepository());
