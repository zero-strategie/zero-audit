import { describe, expect, it } from 'vitest';
import { MigrateStorage } from '../../src/application/migrate-storage.js';

describe('MigrateStorage', () => {
  it('runs the migrator once', async () => {
    let runs = 0;
    const migrator = {
      migrate: () => {
        runs += 1;
        return Promise.resolve();
      },
    };

    await new MigrateStorage(migrator).execute();

    expect(runs).toBe(1);
  });

  it('lets a migration failure through', async () => {
    const migrator = { migrate: () => Promise.reject(new Error('locked')) };

    await expect(new MigrateStorage(migrator).execute()).rejects.toThrow('locked');
  });
});
