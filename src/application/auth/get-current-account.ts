import { Unauthenticated } from '../../domain/errors.js';
import type { ResolveSession } from './resolve-session.js';

export interface GetCurrentAccountDependencies {
  readonly resolveSession: ResolveSession;
  /** Normalized with `normalizeEmail`. */
  readonly adminEmails: readonly string[];
}

export interface CurrentAccount {
  readonly email: string;
  readonly isAdmin: boolean;
}

export class GetCurrentAccount {
  constructor(private readonly dependencies: GetCurrentAccountDependencies) {}

  async execute(sessionId: string | undefined): Promise<CurrentAccount> {
    const user = await this.dependencies.resolveSession.execute(sessionId);
    if (!user) throw new Unauthenticated();
    return { email: user.email, isAdmin: this.dependencies.adminEmails.includes(user.email) };
  }
}
