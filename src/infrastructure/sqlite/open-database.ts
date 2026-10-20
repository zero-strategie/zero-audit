import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const IN_MEMORY_PATH = ':memory:';

export const openDatabase = (path: string): Database.Database => {
  if (path !== IN_MEMORY_PATH) mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
};
