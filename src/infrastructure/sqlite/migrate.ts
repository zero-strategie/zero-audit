import type { Database } from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');
const MIGRATION_FILE = /^(\d+)_.+\.sql$/;

export const currentSchemaVersion = (db: Database): number => {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'")
    .get();
  if (!table) return 0;
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as {
    version: number | null;
  };
  return row.version ?? 0;
};

export const migrate = (db: Database): void => {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
  const applied = currentSchemaVersion(db);
  const pending = readdirSync(MIGRATIONS_DIR)
    .flatMap((file) => {
      const match = MIGRATION_FILE.exec(file);
      return match?.[1] ? [{ file, version: Number(match[1]) }] : [];
    })
    .filter(({ version }) => version > applied)
    .sort((a, b) => a.version - b.version);

  for (const { file, version } of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
    })();
  }
};
