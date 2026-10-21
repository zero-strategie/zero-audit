import { describe, expect, it } from 'vitest';
import type { UserRepository } from '../../src/application/ports/user-repository.js';
import { EmailAlreadyRegistered } from '../../src/domain/errors.js';

const createdAt = new Date('2026-01-01T10:00:00.123Z');

export const describeUserRepositoryContract = (
  factory: () => Promise<UserRepository> | UserRepository,
): void => {
  describe('UserRepository contract', () => {
    it('finds a created account by e-mail, unverified', async () => {
      const users = await factory();
      const created = await users.create({
        email: 'alice@example.fr',
        passwordHash: 'hash-1',
        createdAt,
      });

      const found = await users.findByEmail('alice@example.fr');

      expect(found).toEqual(created);
      expect(found).toMatchObject({
        email: 'alice@example.fr',
        passwordHash: 'hash-1',
        verifiedAt: null,
        createdAt,
      });
    });

    it('finds a created account by id', async () => {
      const users = await factory();
      const created = await users.create({ email: 'a@x.fr', passwordHash: 'h', createdAt });
      expect(await users.findById(created.id)).toEqual(created);
    });

    it('returns null for an unknown e-mail or id', async () => {
      const users = await factory();
      expect(await users.findByEmail('nobody@example.fr')).toBeNull();
      expect(await users.findById('missing')).toBeNull();
    });

    it('refuses a second account with the same e-mail', async () => {
      const users = await factory();
      await users.create({ email: 'alice@example.fr', passwordHash: 'h', createdAt });
      await expect(
        users.create({ email: 'alice@example.fr', passwordHash: 'other', createdAt }),
      ).rejects.toThrow(EmailAlreadyRegistered);
    });
  });
};
