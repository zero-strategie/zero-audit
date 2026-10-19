import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createPool } from '../../src/infrastructure/postgres/pool.js';

export const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

export interface TestDatabase {
  readonly pool: pg.Pool;
  readonly schema: string;
  dispose(): Promise<void>;
}

/** Each test file works in its own schema so parallel files and reruns never share state. */
export const createTestDatabase = async (url: string): Promise<TestDatabase> => {
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = createPool(url, { schema });
  return {
    pool,
    schema,
    dispose: async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
};
