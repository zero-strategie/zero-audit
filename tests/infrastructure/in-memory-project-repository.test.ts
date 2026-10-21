import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemoryUserRepository } from '../../src/infrastructure/in-memory-user-repository.js';
import { describeProjectRepositoryContract } from '../support/project-repository-contract.js';

describeProjectRepositoryContract(() => ({
  projects: new InMemoryProjectRepository(),
  users: new InMemoryUserRepository(),
}));
