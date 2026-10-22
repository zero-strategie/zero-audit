import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../../src/cli/run-cli.js';
import { createStorage, type StorageConfig } from '../../src/composition/storage.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';
import { TEST_DATABASE_URL } from '../support/postgres-test-database.js';

const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' };
const RICH_TEXT = 'Un paragraphe de texte éditorial. '.repeat(40);
const MARKUP_HEAVY_BODY = `<nav>${'<ul class="menu-list"><li class="menu-item"><a class="menu-link" href="/rich">M</a></li></ul>'.repeat(60)}</nav><p>Peu de texte</p>`;

const SITE = {
  '/': {
    status: 200,
    headers: HTML_HEADERS,
    body: `<html><head><title>Accueil</title></head><body><a href="/heavy">a</a><a href="/rich">b</a>${RICH_TEXT}</body></html>`,
  },
  '/heavy': {
    status: 200,
    headers: HTML_HEADERS,
    body: `<html><head><title>Lourde</title></head><body>${MARKUP_HEAVY_BODY}</body></html>`,
  },
  '/rich': {
    status: 200,
    headers: HTML_HEADERS,
    body: `<html><head><title>Riche</title></head><body><p>${RICH_TEXT}</p></body></html>`,
  },
};

const silentIo: CliIo = { stdout: () => undefined, stderr: () => undefined, stderrIsTty: false };

type StoreCase = readonly [name: 'sqlite' | 'postgres', skip: boolean];

const STORES: readonly StoreCase[] = [
  ['sqlite', false],
  ['postgres', TEST_DATABASE_URL === undefined],
];

describe('check 112 end to end', () => {
  let server: FixtureServer;
  let dir: string;

  beforeEach(async () => {
    server = await startFixtureServer(SITE);
    dir = mkdtempSync(join(tmpdir(), 'zero-audit-text-ratio-'));
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe.each(STORES)('with %s', (store, skip) => {
    it.skipIf(skip)('flags only the markup-heavy page', async () => {
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
      try {
        const details = await storage.snapshots.getById(snapshotId);
        const result = details?.checkResults.find((r) => r.checkId === 112);
        expect(result?.occurrences.map((o) => o.pageUrl)).toEqual([`${server.baseUrl}/heavy`]);
      } finally {
        await storage.close();
      }
    });
  });
});
