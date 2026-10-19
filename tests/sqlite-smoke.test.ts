import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

it('opens an in-memory SQLite database and runs SELECT 1', () => {
  const db = new Database(':memory:');
  const row = db.prepare('SELECT 1 AS one').get() as { one: number };
  db.close();
  expect(row.one).toBe(1);
});
