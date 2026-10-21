import { InMemorySessionRepository } from '../../src/infrastructure/in-memory-session-repository.js';
import { InMemoryUserRepository } from '../../src/infrastructure/in-memory-user-repository.js';
import { describeSessionRepositoryContract } from '../support/session-repository-contract.js';

describeSessionRepositoryContract(() => ({
  sessions: new InMemorySessionRepository(),
  users: new InMemoryUserRepository(),
}));
