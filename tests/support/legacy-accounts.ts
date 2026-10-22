import type { Database as SqliteDatabase } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';

/**
 * Accounts as the hosted product leaves them in the legacy tables: the core only reads them to
 * journal launches, so tests insert them with plain SQL instead of going through a repository.
 */
export interface LegacyAccounts {
  /** Inserts a user and returns its id. */
  insertUser(email: string): Promise<string>;
}

const PLACEHOLDER_PASSWORD_HASH = 'not-a-real-hash';
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

export const sqliteLegacyAccounts = (db: SqliteDatabase): LegacyAccounts => ({
  insertUser: (email) => {
    const id = randomUUID();
    db.prepare(
      'INSERT INTO users (id, email, password_hash, verified_at, created_at) VALUES (?, ?, ?, NULL, ?)',
    ).run(id, email, PLACEHOLDER_PASSWORD_HASH, CREATED_AT.toISOString());
    return Promise.resolve(id);
  },
});

export const postgresLegacyAccounts = (pool: pg.Pool): LegacyAccounts => ({
  insertUser: async (email) => {
    const id = randomUUID();
    await pool.query(
      'INSERT INTO users (id, email, password_hash, verified_at, created_at) VALUES ($1, $2, $3, NULL, $4)',
      [id, email, PLACEHOLDER_PASSWORD_HASH, CREATED_AT],
    );
    return id;
  },
});

export interface InMemoryLegacyAccounts extends LegacyAccounts {
  emailOf(userId: string): Promise<string | null>;
}

export const inMemoryLegacyAccounts = (): InMemoryLegacyAccounts => {
  const emails = new Map<string, string>();
  return {
    insertUser: (email) => {
      const id = randomUUID();
      emails.set(id, email);
      return Promise.resolve(id);
    },
    emailOf: (userId) => Promise.resolve(emails.get(userId) ?? null),
  };
};
