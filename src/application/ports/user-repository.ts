import type { User } from '../../domain/user.js';

export interface UserRepository {
  /**
   * `email` must already be normalized. Throws `EmailAlreadyRegistered` when the address is taken.
   * The account starts unverified.
   */
  create(input: { email: string; passwordHash: string; createdAt: Date }): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  markVerified(id: string, verifiedAt: Date): Promise<void>;
  findById(id: string): Promise<User | null>;
}
