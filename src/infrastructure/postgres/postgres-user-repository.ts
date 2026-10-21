import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { UserRepository } from '../../application/ports/user-repository.js';
import { EmailAlreadyRegistered } from '../../domain/errors.js';
import type { User } from '../../domain/user.js';

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  verified_at: Date | null;
  created_at: Date;
};

const PG_UNIQUE_VIOLATION = '23505';

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  verifiedAt: row.verified_at,
  createdAt: row.created_at,
});

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === PG_UNIQUE_VIOLATION;

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: { email: string; passwordHash: string; createdAt: Date }): Promise<User> {
    const user: User = { id: randomUUID(), verifiedAt: null, ...input };
    try {
      await this.pool.query(
        'INSERT INTO users (id, email, password_hash, verified_at, created_at) VALUES ($1, $2, $3, NULL, $4)',
        [user.id, user.email, user.passwordHash, user.createdAt],
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailAlreadyRegistered();
      throw error;
    }
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findOne('email', email);
  }

  async markVerified(id: string, verifiedAt: Date): Promise<void> {
    await this.pool.query('UPDATE users SET verified_at = $1 WHERE id = $2', [verifiedAt, id]);
  }

  findById(id: string): Promise<User | null> {
    return this.findOne('id', id);
  }

  private async findOne(column: 'email' | 'id', value: string): Promise<User | null> {
    const { rows } = await this.pool.query<UserRow>(`SELECT * FROM users WHERE ${column} = $1`, [
      value,
    ]);
    return rows[0] ? toUser(rows[0]) : null;
  }
}
