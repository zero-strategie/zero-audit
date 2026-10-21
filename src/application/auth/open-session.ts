import { SESSION_TTL_MS } from '../../domain/session.js';
import type { Clock } from '../ports/clock.js';
import type { SessionRepository } from '../ports/session-repository.js';
import type { TokenGenerator } from '../ports/token-generator.js';

export interface OpenSessionDependencies {
  readonly sessions: SessionRepository;
  readonly tokenGenerator: TokenGenerator;
  readonly clock: Clock;
}

/** Returns the identifier the browser must hold; only its hash is stored. */
export class OpenSession {
  constructor(private readonly dependencies: OpenSessionDependencies) {}

  async execute(userId: string): Promise<string> {
    const { sessions, tokenGenerator, clock } = this.dependencies;
    const createdAt = new Date(clock.now());
    const id = tokenGenerator.generate();
    await sessions.create({
      id,
      userId,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + SESSION_TTL_MS),
    });
    return id;
  }
}
