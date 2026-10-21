import { ANONYMOUS_READER, type Reader } from '../../domain/reader.js';
import type { ResolveSession } from './resolve-session.js';

export interface ResolveReaderDependencies {
  readonly resolveSession: ResolveSession;
  /** Normalized with `normalizeEmail`. */
  readonly adminEmails: readonly string[];
}

/** An unknown or expired session is not an error on read routes: the reader is anonymous. */
export class ResolveReader {
  constructor(private readonly dependencies: ResolveReaderDependencies) {}

  async execute(sessionId: string | undefined): Promise<Reader> {
    const user = await this.dependencies.resolveSession.execute(sessionId);
    if (!user) return ANONYMOUS_READER;
    return {
      kind: 'account',
      userId: user.id,
      isAdmin: this.dependencies.adminEmails.includes(user.email),
    };
  }
}
