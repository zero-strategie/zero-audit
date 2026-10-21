import type { Database as SqliteDatabase } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { UserRepository } from '../../application/ports/user-repository.js';
import { EmailAlreadyRegistered } from '../../domain/errors.js';
import type { User } from '../../domain/user.js';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  verified_at: string | null;
  created_at: string;
}

const SQLITE_UNIQUE_VIOLATION = 'SQLITE_CONSTRAINT_UNIQUE';

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  verifiedAt: row.verified_at === null ? null : new Date(row.verified_at),
  createdAt: new Date(row.created_at),
});

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === SQLITE_UNIQUE_VIOLATION;

export class SqliteUserRepository implements UserRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(input: { email: string; passwordHash: string; createdAt: Date }): Promise<User> {
    const user: User = { id: randomUUID(), verifiedAt: null, ...input };
    try {
      this.db
        .prepare(
          'INSERT INTO users (id, email, password_hash, verified_at, created_at) VALUES (?, ?, ?, NULL, ?)',
        )
        .run(user.id, user.email, user.passwordHash, user.createdAt.toISOString());
      return Promise.resolve(user);
    } catch (error) {
      if (isUniqueViolation(error)) return Promise.reject(new EmailAlreadyRegistered());
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve(this.findOne('email', email));
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.findOne('id', id));
  }

  private findOne(column: 'email' | 'id', value: string): User | null {
    const row = this.db.prepare(`SELECT * FROM users WHERE ${column} = ?`).get(value) as
      UserRow | undefined;
    return row ? toUser(row) : null;
  }
}
