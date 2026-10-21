import { InMemoryUserRepository } from '../../src/infrastructure/in-memory-user-repository.js';
import { describeUserRepositoryContract } from '../support/user-repository-contract.js';

describeUserRepositoryContract(() => new InMemoryUserRepository());
