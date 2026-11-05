import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../../src/cli/run-cli.js';
import { createStorage, type StorageConfig } from '../../src/composition/storage.js';
import { BfsCrawler } from '../../src/application/bfs-crawler.js';
import { ListIssues } from '../../src/application/list-issues.js';
import { runChecks } from '../../src/application/run-checks.js';
import type { HttpClient } from '../../src/application/ports/http-client.js';
import { CheckRegistry } from '../../src/domain/check.js';
import { allChecks } from '../../src/domain/checks/index.js';
import { ANONYMOUS_READER } from '../../src/domain/reader.js';
import { CheerioHtmlParser } from '../../src/infrastructure/cheerio-html-parser.js';
import { FastXmlSitemapReader } from '../../src/infrastructure/fast-xml-sitemap-reader.js';
import { RobotsParserAdapter } from '../../src/infrastructure/robots-parser-adapter.js';
import { SystemClock } from '../../src/infrastructure/system-clock.js';
import { UndiciHttpClient } from '../../src/infrastructure/undici-http-client.js';
import {
  startFixtureServer,
  type FixtureRoute,
  type FixtureServer,
} from '../support/fixture-server.js';
import { TEST_DATABASE_URL } from '../support/postgres-test-database.js';

const HTML = { 'content-type': 'text/html; charset=utf-8' };
const TEXT = { 'content-type': 'text/plain; charset=utf-8' };
const XML = { 'content-type': 'application/xml' };

const page = (title: string, head: string, body: string): FixtureRoute => ({
  status: 200,
  headers: HTML,
  body: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body><main><h1>${title}</h1>${body}</main></body></html>`,
});

const INVALID_JSON_LD = '<script type="application/ld+json">{ not json</script>';
const MIXED_CONTENT = '<img src="http://cdn.exemple.test/logo.png" alt="logo">';

const siteRoutes = (baseUrl: string): Record<string, FixtureRoute> => ({
  '/': page(
    'Accueil',
    `<link rel="alternate" hreflang="en-UK" href="/en">${INVALID_JSON_LD}`,
    '<a href="/en">english</a>',
  ),
  '/en': page('English', '', `<p>Second page.</p>${MIXED_CONTENT}`),
  '/robots.txt': { status: 200, headers: TEXT, body: 'User-agent: *\nthis is not a directive\n' },
  '/sitemap.xml': {
    status: 200,
    headers: XML,
    body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${baseUrl}/gone</loc></url></urlset>`,
  },
  '/llms.txt': { status: 200, headers: TEXT, body: 'No heading here\n' },
});

const silentIo: CliIo = { stdout: () => undefined, stderr: () => undefined, stderrIsTty: false };

type StoreCase = readonly [name: 'sqlite' | 'postgres', skip: boolean];

const STORES: readonly StoreCase[] = [
  ['sqlite', false],
  ['postgres', TEST_DATABASE_URL === undefined],
];

describe('checks of lot 2 end to end', () => {
  let server: FixtureServer;
  let routes: Record<string, FixtureRoute>;
  let dir: string;

  beforeEach(async () => {
    routes = {};
    server = await startFixtureServer(routes);
    Object.assign(routes, siteRoutes(server.baseUrl));
    dir = mkdtempSync(join(tmpdir(), 'zero-audit-checks-lot2-'));
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe.each(STORES)('with %s', (store, skip) => {
    it.skipIf(skip)('reports 23, 24, 45, 16, 18 and 219 from the stored snapshot', async () => {
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
      const [config] = configs;
      if (config === undefined) throw new Error('storageFactory was never called');
      const storage = await createStorage(config);
      try {
        const issues = await new ListIssues(storage.snapshots, storage.projects, allChecks).execute(
          ANONYMOUS_READER,
          snapshotId,
          {},
        );
        const counts = Object.fromEntries(issues.map((issue) => [issue.checkId, issue.count]));

        for (const checkId of [23, 24, 45, 16, 18, 219]) {
          expect(counts[checkId], `check ${String(checkId)}`).toBeGreaterThanOrEqual(1);
        }
      } finally {
        await storage.close();
      }
    });
  });

  // The CLI crawls http fixtures only (no TLS, and the TLS verification stays on), so check 30,
  // which judges https pages, is proven by crawling an https site served by the same fixtures.
  it('reports 30 on an https site whose requests are served by the local fixtures', async () => {
    const origin = 'https://site.exemple.test';
    const local = new UndiciHttpClient({ clock: new SystemClock(), userAgent: 'test' });
    const http: HttpClient = {
      get: async (url) => {
        const result = await local.get(url.replace(origin, server.baseUrl));
        return { ...result, url: result.url.replace(server.baseUrl, origin) };
      },
    };

    const crawl = await new BfsCrawler({
      http,
      robotsFactory: new RobotsParserAdapter(),
      sitemapReader: new FastXmlSitemapReader(),
      htmlParser: new CheerioHtmlParser(),
      clock: new SystemClock(),
      sleeper: { sleep: () => Promise.resolve() },
    }).crawl({ rootUrl: `${origin}/`, limit: 10, delayMs: 0 });
    const result = runChecks(crawl, new CheckRegistry(allChecks)).find((r) => r.checkId === 30);

    expect(result?.occurrences.map((o) => o.pageUrl)).toEqual([`${origin}/en`]);
  });
});
