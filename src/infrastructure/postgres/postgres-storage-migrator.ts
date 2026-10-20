import type pg from 'pg';
import type { StorageMigrator } from '../../application/ports/storage-migrator.js';
import { migrate } from './migrate.js';

export class PostgresStorageMigrator implements StorageMigrator {
  constructor(private readonly pool: pg.Pool) {}

  migrate(): Promise<void> {
    return migrate(this.pool);
  }
}
