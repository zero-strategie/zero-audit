import { describe, expect, it } from 'vitest';
import type { SessionRepository } from '../../src/application/ports/session-repository.js';
import type { UserRepository } from '../../src/application/ports/user-repository.js';
import { hashToken } from '../../src/infrastructure/hash-token.js';

const NOW = new Date('2026-03-10T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
const at = (offsetHours: number): Date => new Date(NOW.getTime() + offsetHours * HOUR_MS);

export interface SessionStorage {
  readonly sessions: SessionRepository;
  readonly users: UserRepository;
}

export const describeSessionRepositoryContract = (
  factory: () => Promise<SessionStorage> | SessionStorage,
): void => {
  describe('SessionRepository contract', () => {
    const setup = async () => {
      const { sessions, users } = await factory();
      const user = await users.create({ email: 'u@example.fr', passwordHash: 'h', createdAt: NOW });
      const other = await users.create({
        email: 'v@example.fr',
        passwordHash: 'h',
        createdAt: NOW,
      });
      return { sessions, userId: user.id, otherId: other.id };
    };

    it('finds a session from its raw identifier, exposing the hash only', async () => {
      const { sessions, userId } = await setup();
      const created = await sessions.create({
        id: 'raw-id-1',
        userId,
        createdAt: NOW,
        expiresAt: at(1),
      });

      const found = await sessions.findValid('raw-id-1', NOW);

      expect(found).toEqual(created);
      expect(found).toEqual({
        idHash: hashToken('raw-id-1'),
        userId,
        createdAt: NOW,
        expiresAt: at(1),
      });
    });

    it('does not find an unknown identifier', async () => {
      const { sessions } = await setup();
      expect(await sessions.findValid('missing', NOW)).toBeNull();
    });

    it('does not find a session whose expiration has passed or is reached', async () => {
      const { sessions, userId } = await setup();
      await sessions.create({ id: 'raw-id-1', userId, createdAt: at(-2), expiresAt: at(-1) });
      await sessions.create({ id: 'raw-id-2', userId, createdAt: at(-2), expiresAt: NOW });

      expect(await sessions.findValid('raw-id-1', NOW)).toBeNull();
      expect(await sessions.findValid('raw-id-2', NOW)).toBeNull();
    });

    it('deletes one session without touching the others', async () => {
      const { sessions, userId } = await setup();
      await sessions.create({ id: 'raw-id-1', userId, createdAt: NOW, expiresAt: at(1) });
      await sessions.create({ id: 'raw-id-2', userId, createdAt: NOW, expiresAt: at(1) });

      await sessions.delete('raw-id-1');

      expect(await sessions.findValid('raw-id-1', NOW)).toBeNull();
      expect(await sessions.findValid('raw-id-2', NOW)).not.toBeNull();
    });

    it('deletes every session of an account only', async () => {
      const { sessions, userId, otherId } = await setup();
      await sessions.create({ id: 'raw-id-1', userId, createdAt: NOW, expiresAt: at(1) });
      await sessions.create({ id: 'raw-id-2', userId, createdAt: NOW, expiresAt: at(1) });
      await sessions.create({ id: 'raw-id-3', userId: otherId, createdAt: NOW, expiresAt: at(1) });

      await sessions.deleteAllForUser(userId);

      expect(await sessions.findValid('raw-id-1', NOW)).toBeNull();
      expect(await sessions.findValid('raw-id-2', NOW)).toBeNull();
      expect(await sessions.findValid('raw-id-3', NOW)).not.toBeNull();
    });

    it('purges the expired sessions and keeps the valid ones', async () => {
      const { sessions, userId } = await setup();
      await sessions.create({ id: 'expired', userId, createdAt: at(-5), expiresAt: at(-1) });
      await sessions.create({ id: 'valid', userId, createdAt: NOW, expiresAt: at(1) });

      expect(await sessions.deleteExpired(NOW)).toBe(1);

      expect(await sessions.findValid('valid', NOW)).not.toBeNull();
      expect(await sessions.deleteExpired(NOW)).toBe(0);
    });
  });
};
