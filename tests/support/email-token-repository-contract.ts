import { describe, expect, it } from 'vitest';
import type { EmailTokenRepository } from '../../src/application/ports/email-token-repository.js';
import type { UserRepository } from '../../src/application/ports/user-repository.js';
import { hashToken } from '../../src/infrastructure/hash-token.js';

const NOW = new Date('2026-03-10T12:00:00.000Z');
const MINUTE_MS = 60 * 1000;
const at = (offsetMinutes: number): Date => new Date(NOW.getTime() + offsetMinutes * MINUTE_MS);

export interface EmailTokenStorage {
  readonly emailTokens: EmailTokenRepository;
  readonly users: UserRepository;
}

export const describeEmailTokenRepositoryContract = (
  factory: () => Promise<EmailTokenStorage> | EmailTokenStorage,
): void => {
  describe('EmailTokenRepository contract', () => {
    const setup = async () => {
      const { emailTokens, users } = await factory();
      const user = await users.create({ email: 'u@example.fr', passwordHash: 'h', createdAt: NOW });
      const issue = (token: string, createdAt: Date, expiresAt: Date, email = 'u@example.fr') =>
        emailTokens.create({
          token,
          userId: user.id,
          email,
          kind: 'verify',
          createdAt,
          expiresAt,
        });
      return { emailTokens, userId: user.id, issue };
    };

    it('consumes a token from its raw value, stamping its use and exposing the hash only', async () => {
      const { emailTokens, userId, issue } = await setup();
      await issue('raw-token', NOW, at(60));

      const consumed = await emailTokens.consume('raw-token', 'verify', at(1));

      expect(consumed).toEqual({
        tokenHash: hashToken('raw-token'),
        userId,
        email: 'u@example.fr',
        kind: 'verify',
        createdAt: NOW,
        expiresAt: at(60),
        usedAt: at(1),
      });
    });

    it('consumes a token only once', async () => {
      const { emailTokens, issue } = await setup();
      await issue('raw-token', NOW, at(60));

      expect(await emailTokens.consume('raw-token', 'verify', at(1))).not.toBeNull();
      expect(await emailTokens.consume('raw-token', 'verify', at(2))).toBeNull();
    });

    it('does not consume an unknown token', async () => {
      const { emailTokens } = await setup();
      expect(await emailTokens.consume('missing', 'verify', NOW)).toBeNull();
    });

    it('does not consume a token as another kind, and keeps it usable', async () => {
      const { emailTokens, issue } = await setup();
      await issue('raw-token', NOW, at(60));

      expect(await emailTokens.consume('raw-token', 'reset', at(1))).toBeNull();
      expect(await emailTokens.consume('raw-token', 'verify', at(1))).not.toBeNull();
    });

    it('does not consume an expired token', async () => {
      const { emailTokens, issue } = await setup();
      await issue('raw-token', at(-120), at(-60));
      await issue('at-limit', at(-120), NOW);

      expect(await emailTokens.consume('raw-token', 'verify', NOW)).toBeNull();
      expect(await emailTokens.consume('at-limit', 'verify', NOW)).toBeNull();
    });

    it('counts the tokens created for an address since a date, and no older one', async () => {
      const { emailTokens, issue } = await setup();
      await issue('t1', at(-10), at(50));
      await issue('t2', at(-30), at(30));
      await issue('t3', at(-59), at(1));
      await issue('too-old', at(-61), at(-1));
      await issue('other-address', at(-10), at(50), 'other@example.fr');

      expect(await emailTokens.countCreatedSince('u@example.fr', at(-60))).toBe(3);
    });

    it('purges the expired tokens and keeps the others, used or not', async () => {
      const { emailTokens, issue } = await setup();
      await issue('expired', at(-120), at(-60));
      await issue('valid', NOW, at(60));
      await issue('used', NOW, at(60));
      await emailTokens.consume('used', 'verify', NOW);

      expect(await emailTokens.deleteExpired(NOW)).toBe(1);

      expect(await emailTokens.consume('valid', 'verify', NOW)).not.toBeNull();
      expect(await emailTokens.countCreatedSince('u@example.fr', at(-1))).toBe(2);
    });
  });
};
