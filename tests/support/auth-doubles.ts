import type { Clock } from '../../src/application/ports/clock.js';
import type { Mailer } from '../../src/application/ports/mailer.js';
import type { PasswordHasher } from '../../src/application/ports/password-hasher.js';
import type { TokenGenerator } from '../../src/application/ports/token-generator.js';
import { MailerUnavailable } from '../../src/domain/errors.js';
import { InMemoryEmailTokenRepository } from '../../src/infrastructure/in-memory-email-token-repository.js';
import { InMemorySessionRepository } from '../../src/infrastructure/in-memory-session-repository.js';
import { InMemoryUserRepository } from '../../src/infrastructure/in-memory-user-repository.js';

export const NOW = new Date('2026-05-04T09:00:00.000Z');
export const PUBLIC_URL = 'https://audit.exemple.test';
export const HOUR_MS = 60 * 60 * 1000;

export class MutableClock implements Clock {
  constructor(private current: Date = NOW) {}

  now(): number {
    return this.current.getTime();
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SpyMailer implements Mailer {
  enabled = true;
  readonly sent: { to: string; link: string }[] = [];

  sendVerification(to: string, link: string): Promise<void> {
    if (!this.enabled) return Promise.reject(new MailerUnavailable());
    this.sent.push({ to, link });
    return Promise.resolve();
  }

  sendPasswordReset(to: string, link: string): Promise<void> {
    if (!this.enabled) return Promise.reject(new MailerUnavailable());
    this.sent.push({ to, link });
    return Promise.resolve();
  }

  /** Raw token carried by the n-th link sent. */
  tokenOfLink(index: number): string {
    const link = this.sent[index]?.link ?? '';
    return new URL(link).searchParams.get('token') ?? '';
  }
}

export class SequentialTokenGenerator implements TokenGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `token-${String(this.counter)}`;
  }
}

export class FakePasswordHasher implements PasswordHasher {
  dummyCalls = 0;

  hash(password: string): Promise<string> {
    return Promise.resolve(`hashed:${password}`);
  }

  verify(password: string, storedHash: string): Promise<boolean> {
    return Promise.resolve(storedHash === `hashed:${password}`);
  }

  verifyDummy(): Promise<boolean> {
    this.dummyCalls += 1;
    return Promise.resolve(false);
  }
}

export const buildAuthKit = () => ({
  users: new InMemoryUserRepository(),
  sessions: new InMemorySessionRepository(),
  emailTokens: new InMemoryEmailTokenRepository(),
  passwordHasher: new FakePasswordHasher(),
  mailer: new SpyMailer(),
  tokenGenerator: new SequentialTokenGenerator(),
  clock: new MutableClock(),
  publicUrl: PUBLIC_URL,
});

/** Account dependencies for server tests that never touch the authentication routes. */
export const idleAccountDependencies = () => ({ ...buildAuthKit(), adminEmails: [] as string[] });
