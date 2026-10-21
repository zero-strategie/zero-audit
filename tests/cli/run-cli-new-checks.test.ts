import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../../src/cli/run-cli.js';
import { createStorage, type StorageConfig } from '../../src/cli/storage-factory.js';
import { idleAuditDependencies } from '../support/audit-doubles.js';
import { idleAccountDependencies } from '../support/auth-doubles.js';
import { buildServer } from '../../src/http/server.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';
import { TEST_DATABASE_URL } from '../support/postgres-test-database.js';

const SAME_TEXT = 'Page identique pour le titre et le H1';

const SITE = {
  '/': {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<html><head><title>${SAME_TEXT}</title></head><body><h1>${SAME_TEXT}</h1></body></html>`,
  },
};

const silentIo: CliIo = { stdout: () => undefined, stderr: () => undefined, stderrIsTty: false };

type StoreCase = readonly [name: 'sqlite' | 'postgres', skip: boolean];

const STORES: readonly StoreCase[] = [
  ['sqlite', false],
  ['postgres', TEST_DATABASE_URL === undefined],
];

describe('checks 105, 137 and 205 end to end', () => {
  let server: FixtureServer;
  let dir: string;

  beforeEach(async () => {
    server = await startFixtureServer(SITE);
    dir = mkdtempSync(join(tmpdir(), 'zero-audit-new-checks-'));
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe.each(STORES)('with %s', (store, skip) => {
    it.skipIf(skip)('reports 105 and 137, and no 205 over http, through the API', async () => {
      const configs: StorageConfig[] = [];
      let snapshotId = '';
      const args = [server.baseUrl, '--direct', '--delay', '0', '--db', join(dir, 'audit.db')];

      const code = await runCli(
        store === 'postgres' ? [...args, '--store', 'postgres'] : args,
        { DATABASE_URL: TEST_DATABASE_URL },
        silentIo,
        {
          storageFactory: (config) => {
            configs.push(config);
            return createStorage(config);
          },
          onAuditStarted: (id) => {
            snapshotId = id;
          },
        },
      );

      expect(code).toBe(0);
      const storage = await createStorage(configs[0] as StorageConfig);
      const app = buildServer({
        ...idleAccountDependencies(),
        projects: storage.projects,
        snapshots: storage.snapshots,
        health: storage.health,
        ...idleAuditDependencies(),
      });
      try {
        const response = await app.inject(`/snapshots/${snapshotId}/issues`);
        const counts = Object.fromEntries(
          response.json<{ checkId: number; count: number }[]>().map((i) => [i.checkId, i.count]),
        );
        expect(counts).toMatchObject({ 105: 1, 137: 1, 205: 0 });
      } finally {
        await app.close();
        await storage.close();
      }
    });
  });
});
