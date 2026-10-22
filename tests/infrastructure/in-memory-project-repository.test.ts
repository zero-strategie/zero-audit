import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { inMemoryLegacyAccounts } from '../support/legacy-accounts.js';
import { describeProjectRepositoryContract } from '../support/project-repository-contract.js';

describeProjectRepositoryContract(() => ({
  projects: new InMemoryProjectRepository(),
  accounts: inMemoryLegacyAccounts(),
}));
