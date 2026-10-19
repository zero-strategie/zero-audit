import { describe, expect, it } from 'vitest';
import { BfsCrawler } from '../../src/application/bfs-crawler.js';
import type { HttpClient, HttpResponse } from '../../src/application/ports/http-client.js';
import { runChecks } from '../../src/application/run-checks.js';
import { CheckRegistry } from '../../src/domain/check.js';
import { allChecks } from '../../src/domain/checks/index.js';
import { CheerioHtmlParser } from '../../src/infrastructure/cheerio-html-parser.js';
import { FastXmlSitemapReader } from '../../src/infrastructure/fast-xml-sitemap-reader.js';
import { RobotsParserAdapter } from '../../src/infrastructure/robots-parser-adapter.js';

const SITE = 'http://site.test';

const html = (...hrefs: string[]): string =>
  `<html><body>${hrefs.map((href) => `<a href="${href}">link</a>`).join('')}</body></html>`;

/** The home page links both forms; `/x/` links back to `/x`, as in the milestone 1 acceptance run. */
const REPLIES: Readonly<Record<string, string>> = {
  [`${SITE}/`]: html('/x', '/x/'),
  [`${SITE}/x`]: html(),
  [`${SITE}/x/`]: html('/x'),
};

const site: HttpClient = {
  get: (url) => {
    const body = REPLIES[url];
    const response: HttpResponse = {
      url,
      status: body === undefined ? 404 : 200,
      headers: { 'content-type': 'text/html' },
      body: body ?? '',
      truncated: false,
      responseTimeMs: 0,
    };
    return Promise.resolve(response);
  },
};

const crawlSite = () =>
  new BfsCrawler({
    http: site,
    robotsFactory: new RobotsParserAdapter(),
    sitemapReader: new FastXmlSitemapReader(),
    htmlParser: new CheerioHtmlParser(),
    clock: { now: () => 0 },
    sleeper: { sleep: () => Promise.resolve() },
  }).crawl({ rootUrl: `${SITE}/`, limit: 100, delayMs: 0 });

describe('trailing-slash variants of the same page', () => {
  it('are recorded as two distinct pages, never merged', async () => {
    const { pages } = await crawlSite();

    expect(pages.map((p) => p.url)).toEqual([`${SITE}/`, `${SITE}/x`, `${SITE}/x/`]);
  });

  it('give check 213 the count of the milestone 1 definition (inlinks split across variants)', async () => {
    const crawl = await crawlSite();

    const result = runChecks(crawl, new CheckRegistry(allChecks)).find((r) => r.checkId === 213);

    // Only /x/ has a single distinct source (the home page); /x has two.
    expect(result?.occurrences.map((o) => o.pageUrl)).toEqual([`${SITE}/x/`]);
  });
});
