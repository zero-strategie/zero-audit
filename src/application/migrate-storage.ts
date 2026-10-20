import type { StorageMigrator } from './ports/storage-migrator.js';

export class MigrateStorage {
  constructor(private readonly migrator: StorageMigrator) {}

  execute(): Promise<void> {
    return this.migrator.migrate();
  }
}
