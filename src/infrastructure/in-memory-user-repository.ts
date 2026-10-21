import { randomUUID } from 'node:crypto';
import type { UserRepository } from '../application/ports/user-repository.js';
import { EmailAlreadyRegistered } from '../domain/errors.js';
import type { User } from '../domain/user.js';

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  create(input: { email: string; passwordHash: string; createdAt: Date }): Promise<User> {
    if (this.find((user) => user.email === input.email)) {
      return Promise.reject(new EmailAlreadyRegistered());
    }
    const user: User = { id: randomUUID(), verifiedAt: null, ...input };
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }

  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve(this.find((user) => user.email === email));
  }

  markVerified(id: string, verifiedAt: Date): Promise<void> {
    const user = this.users.get(id);
    if (user) this.users.set(id, { ...user, verifiedAt });
    return Promise.resolve();
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  /** For `InMemoryAccountEraser` only. */
  eraseUser(id: string): void {
    this.users.delete(id);
  }

  /** For `InMemoryAccountEraser` only. */
  unverifiedCreatedBefore(date: Date): readonly User[] {
    return [...this.users.values()].filter(
      (user) => user.verifiedAt === null && user.createdAt < date,
    );
  }

  private find(matches: (user: User) => boolean): User | null {
    return [...this.users.values()].find(matches) ?? null;
  }
}
