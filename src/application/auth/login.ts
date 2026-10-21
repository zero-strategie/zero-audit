import { EmailNotVerified, InvalidEmail, Unauthenticated } from '../../domain/errors.js';
import { normalizeEmail, type User } from '../../domain/user.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { OpenSession } from './open-session.js';

export interface LoginDependencies {
  readonly users: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly openSession: OpenSession;
}

export class Login {
  constructor(private readonly dependencies: LoginDependencies) {}

  /** Returns a new session identifier. Unknown address and wrong password are indistinguishable. */
  async execute({ email, password }: { email: string; password: string }): Promise<string> {
    const { passwordHasher, openSession } = this.dependencies;
    const user = await this.findAccount(email);
    if (!user) {
      await passwordHasher.verifyDummy(password);
      throw new Unauthenticated();
    }
    if (!(await passwordHasher.verify(password, user.passwordHash))) throw new Unauthenticated();
    if (!user.verifiedAt) throw new EmailNotVerified();
    return openSession.execute(user.id);
  }

  private async findAccount(email: string): Promise<User | null> {
    try {
      return await this.dependencies.users.findByEmail(normalizeEmail(email));
    } catch (error) {
      if (error instanceof InvalidEmail) return null;
      throw error;
    }
  }
}
