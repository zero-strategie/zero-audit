import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import { withTransaction } from './pool.js';

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');
const MIGRATION_FILE = /^(\d+)_.+\.sql$/;
/** Arbitrary constant: serializes concurrent migrators so a migration is never applied twice. */
const MIGRATION_LOCK_KEY = 7_204_001;

const migrationFiles = (): { file: string; version: number }[] =>
  readdirSync(MIGRATIONS_DIR)
    .flatMap((file) => {
      const match = MIGRATION_FILE.exec(file);
      return match?.[1] ? [{ file, version: Number(match[1]) }] : [];
    })
    .sort((a, b) => a.version - b.version);

export const migrate = async (pool: pg.Pool): Promise<void> => {
  await withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version INTEGER PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query<{ version: number }>(
      'SELECT version FROM schema_migrations',
    );
    const applied = new Set(rows.map(({ version }) => version));
    for (const { file, version } of migrationFiles()) {
      if (applied.has(version)) continue;
      await client.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    }
  });
};
