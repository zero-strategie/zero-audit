import type { StorageMigrator } from '../../application/ports/storage-migrator.js';
import { migrate } from './migrate.js';
import { openDatabase } from './open-database.js';

export class SqliteStorageMigrator implements StorageMigrator {
  constructor(private readonly path: string) {}

  migrate(): Promise<void> {
    const db = openDatabase(this.path);
    try {
      migrate(db);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      db.close();
    }
  }
}
