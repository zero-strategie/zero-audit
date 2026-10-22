import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../../src/cli/run-cli.js';
import { createStorage, type StorageConfig } from '../../src/composition/storage.js';
import { ListIssues } from '../../src/application/list-issues.js';
import type { Clock } from '../../src/application/ports/clock.js';
import { SystemClock } from '../../src/infrastructure/system-clock.js';
import { allChecks } from '../../src/domain/checks/index.js';
import { ANONYMOUS_READER } from '../../src/domain/reader.js';
import { SLOW_RESPONSE_MS } from '../../src/domain/thresholds.js';
import {
  startFixtureServer,
  type FixtureRoute,
  type FixtureServer,
} from '../support/fixture-server.js';
import { TEST_DATABASE_URL } from '../support/postgres-test-database.js';

const HTML = { 'content-type': 'text/html; charset=utf-8' };

const page = (title: string, body: string): FixtureRoute => ({
  status: 200,
  headers: HTML,
  body: `<html><head><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`,
});

const redirect = (status: number, location: string): FixtureRoute => ({
  status,
  headers: { location },
});

const DUPLICATE_BODY = '<p>Contenu strictement identique sur deux adresses.</p>';

const SITE: Record<string, FixtureRoute> = {
  '/': page(
    'Accueil',
    [
      '<a href="/old">ancien</a>',
      '<a href="/promo">promo</a>',
      '<a href="/d1">profondeur</a>',
      '<a href="/private">privé</a>',
      '<a href="/copy-a">copie a</a>',
      '<a href="/copy-b">copie b</a>',
      '<a href="/hidden" rel="nofollow">caché</a>',
      '<a href="/empty"></a>',
      '<a href="/guide.pdf">guide</a>',
    ].join(''),
  ),
  '/old': redirect(301, '/older'),
  '/older': redirect(301, '/current'),
  '/current': page('Page courante', '<p>Destination de la chaîne.</p>'),
  '/promo': redirect(302, '/current'),
  '/d1': page('Niveau 1', '<a href="/d2">suite</a>'),
  '/d2': page('Niveau 2', '<a href="/d3">suite</a>'),
  '/d3': page('Niveau 3', '<a href="/d4">suite</a>'),
  '/d4': page('Niveau 4', '<p>Quatre clics depuis l’accueil.</p>'),
  '/private': {
    status: 200,
    headers: { ...HTML, 'x-robots-tag': 'noindex' },
    body: '<html><head><title>Privé</title></head><body><h1>Privé</h1></body></html>',
  },
  '/copy-a': page('Copie', DUPLICATE_BODY),
  '/copy-b': page('Copie', DUPLICATE_BODY),
  '/hidden': page('Caché', '<p>Cible d’un lien nofollow.</p>'),
  '/empty': page('Vide', '<p>Cible d’un lien sans texte.</p>'),
  '/guide.pdf': { status: 200, headers: { 'content-type': 'application/pdf' }, body: '%PDF-1.4' },
};

const silentIo: CliIo = { stdout: () => undefined, stderr: () => undefined, stderrIsTty: false };

/** Every reading of the clock takes longer than the slow-response threshold. */
class SlowClock implements Clock {
  private current = 0;

  now(): number {
    this.current += SLOW_RESPONSE_MS + 1;
    return this.current;
  }
}

type StoreCase = readonly [name: 'sqlite' | 'postgres', skip: boolean];

const STORES: readonly StoreCase[] = [
  ['sqlite', false],
  ['postgres', TEST_DATABASE_URL === undefined],
];

describe('checks of lot 1 end to end', () => {
  let server: FixtureServer;
  let dir: string;

  beforeEach(async () => {
    server = await startFixtureServer(SITE);
    dir = mkdtempSync(join(tmpdir(), 'zero-audit-checks-lot1-'));
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe.each(STORES)('with %s', (store, skip) => {
    const auditCounts = async (
      clock: Clock = new SystemClock(),
    ): Promise<Record<number, number>> => {
      const configs: StorageConfig[] = [];
      let snapshotId = '';
      const args = [server.baseUrl, '--direct', '--delay', '0', '--db', join(dir, 'audit.db')];

      const code = await runCli(
        store === 'postgres' ? [...args, '--store', 'postgres'] : args,
        { DATABASE_URL: TEST_DATABASE_URL },
        silentIo,
        {
          clock,
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
      const [config] = configs;
      if (config === undefined) throw new Error('storageFactory was never called');
      const storage = await createStorage(config);
      try {
        const issues = await new ListIssues(storage.snapshots, storage.projects, allChecks).execute(
          ANONYMOUS_READER,
          snapshotId,
          {},
        );
        return Object.fromEntries(issues.map((issue) => [issue.checkId, issue.count]));
      } finally {
        await storage.close();
      }
    };

    it.skipIf(skip)(
      'reports 33, 109, 212, 209, 7, 123, 216 and 215 from the stored snapshot',
      async () => {
        const counts = await auditCounts();

        for (const checkId of [33, 109, 212, 209, 7, 123, 216, 215]) {
          expect(counts[checkId], `check ${String(checkId)}`).toBeGreaterThanOrEqual(1);
        }
      },
    );

    it.skipIf(skip)('reports 111 with an injected clock instead of a real wait', async () => {
      const counts = await auditCounts(new SlowClock());

      expect(counts[111]).toBeGreaterThanOrEqual(1);
    });
  });
});
