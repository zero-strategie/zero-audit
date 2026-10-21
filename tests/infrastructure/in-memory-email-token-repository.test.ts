import { InMemoryEmailTokenRepository } from '../../src/infrastructure/in-memory-email-token-repository.js';
import { InMemoryUserRepository } from '../../src/infrastructure/in-memory-user-repository.js';
import { describeEmailTokenRepositoryContract } from '../support/email-token-repository-contract.js';

describeEmailTokenRepositoryContract(() => ({
  emailTokens: new InMemoryEmailTokenRepository(),
  users: new InMemoryUserRepository(),
}));
