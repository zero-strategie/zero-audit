import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const IN_MEMORY_PATH = ':memory:';

/** Several processes (API, workers, CLI) share the file: a locked database is waited for, not an error. */
const BUSY_TIMEOUT_MS = 5000;

export const openDatabase = (path: string): Database.Database => {
  if (path !== IN_MEMORY_PATH) mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma(`busy_timeout = ${String(BUSY_TIMEOUT_MS)}`);
  return db;
};
