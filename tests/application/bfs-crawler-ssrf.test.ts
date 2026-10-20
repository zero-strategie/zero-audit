import { afterEach, describe, expect, it } from 'vitest';
import { BfsCrawler } from '../../src/application/bfs-crawler.js';
import type { HttpClient } from '../../src/application/ports/http-client.js';
import { CheerioHtmlParser } from '../../src/infrastructure/cheerio-html-parser.js';
import { FastXmlSitemapReader } from '../../src/infrastructure/fast-xml-sitemap-reader.js';
import { RobotsParserAdapter } from '../../src/infrastructure/robots-parser-adapter.js';
import { SystemClock } from '../../src/infrastructure/system-clock.js';
import { UndiciHttpClient } from '../../src/infrastructure/undici-http-client.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';

const PUBLIC_HOST = 'site.test';

let server: FixtureServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

/**
 * Serves the public host from the local fixture server (no DNS, no Internet) and sends every
 * other URL, such as a redirect target, through the guarded client.
 */
const publicHostServedLocally = (fixture: FixtureServer, guarded: HttpClient): HttpClient => {
  const unguarded = new UndiciHttpClient({ clock: new SystemClock(), userAgent: 'test' });
  return {
    get: async (url) => {
      const parsed = new URL(url);
      if (parsed.hostname !== PUBLIC_HOST) return guarded.get(url);
      const local = await unguarded.get(`${fixture.baseUrl}${parsed.pathname}`);
      return { ...local, url };
    },
  };
};

describe('BfsCrawler with the SSRF guard', () => {
  it('refuses the hop when the root redirects to a loopback address', async () => {
    server = await startFixtureServer({
      '/': { status: 302, headers: { location: 'http://127.0.0.1/internal' } },
    });
    const guarded = new UndiciHttpClient({
      clock: new SystemClock(),
      userAgent: 'test',
      blockPrivateAddresses: true,
    });
    const crawler = new BfsCrawler({
      http: publicHostServedLocally(server, guarded),
      robotsFactory: new RobotsParserAdapter(),
      sitemapReader: new FastXmlSitemapReader(),
      htmlParser: new CheerioHtmlParser(),
      clock: new SystemClock(),
      sleeper: { sleep: () => Promise.resolve() },
    });

    const crawl = crawler.crawl({ rootUrl: `http://${PUBLIC_HOST}/`, limit: 10, delayMs: 0 });

    await expect(crawl).rejects.toThrow(/blocked/);
  });
});
