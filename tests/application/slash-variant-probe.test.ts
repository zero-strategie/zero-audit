import { describe, expect, it } from 'vitest';
import { BfsCrawler } from '../../src/application/bfs-crawler.js';
import type {
  HttpClient,
  HttpResponse,
  NetworkFailure,
} from '../../src/application/ports/http-client.js';
import { runChecks } from '../../src/application/run-checks.js';
import { CheckRegistry } from '../../src/domain/check.js';
import { allChecks } from '../../src/domain/checks/index.js';
import { CheerioHtmlParser } from '../../src/infrastructure/cheerio-html-parser.js';
import { FastXmlSitemapReader } from '../../src/infrastructure/fast-xml-sitemap-reader.js';
import { RobotsParserAdapter } from '../../src/infrastructure/robots-parser-adapter.js';

const SITE = 'http://site.test';
const CHECK_ID = 1000;

const respond = (
  url: string,
  status: number,
  body = '<html><body></body></html>',
  headers: Record<string, string> = { 'content-type': 'text/html' },
): HttpResponse => ({ url, status, headers, body, truncated: false, responseTimeMs: 0 });

const page = (canonical?: string, ...hrefs: string[]): string =>
  `<html><head>${canonical === undefined ? '' : `<link rel="canonical" href="${canonical}">`}</head><body>${hrefs
    .map((href) => `<a href="${href}">l</a>`)
    .join('')}</body></html>`;

const startScenario = (
  replies: Readonly<Record<string, HttpResponse | NetworkFailure>>,
  limit = 100,
  delayMs = 0,
) => {
  const events: string[] = [];
  const http: HttpClient = {
    get: (url) => {
      events.push(`get ${url}`);
      return Promise.resolve(replies[url] ?? respond(url, 404, ''));
    },
  };
  const crawl = new BfsCrawler({
    http,
    robotsFactory: new RobotsParserAdapter(),
    sitemapReader: new FastXmlSitemapReader(),
    htmlParser: new CheerioHtmlParser(),
    clock: { now: () => 0 },
    sleeper: {
      sleep: (ms) => {
        events.push(`sleep ${String(ms)}`);
        return Promise.resolve();
      },
    },
  }).crawl({ rootUrl: `${SITE}/`, limit, delayMs });
  return { events, crawl };
};

const occurrencesOf = (crawl: Awaited<ReturnType<typeof startScenario>['crawl']>) =>
  runChecks(crawl, new CheckRegistry(allChecks)).find((r) => r.checkId === CHECK_ID)?.occurrences;

const onlyAboutLinked = {
  [`${SITE}/`]: respond(`${SITE}/`, 200, page(undefined, '/about')),
  [`${SITE}/about`]: respond(`${SITE}/about`, 200, page()),
  [`${SITE}/about/`]: respond(`${SITE}/about/`, 200, page()),
};

describe('trailing-slash variant probe', () => {
  it('flags a page whose unlinked slash variant also answers HTML without a shared canonical', async () => {
    const crawl = await startScenario(onlyAboutLinked).crawl;

    expect(occurrencesOf(crawl)).toEqual([
      {
        checkId: CHECK_ID,
        pageUrl: `${SITE}/about`,
        info: { variantUrl: `${SITE}/about/`, kind: 'trailing-slash' },
      },
    ]);
  });

  it('does not count the probe among the explored pages', async () => {
    const { pages } = await startScenario(onlyAboutLinked).crawl;

    expect(pages.map(({ url }) => url)).toEqual([`${SITE}/`, `${SITE}/about`]);
  });

  it('flags the pair when navigation links /about and articles link /about/ (zero-strategie.dev shape)', async () => {
    const crawl = await startScenario({
      [`${SITE}/`]: respond(`${SITE}/`, 200, page(undefined, '/about', '/post')),
      [`${SITE}/about`]: respond(`${SITE}/about`, 200, page()),
      [`${SITE}/post`]: respond(`${SITE}/post`, 200, page(undefined, '/about/')),
      [`${SITE}/about/`]: respond(`${SITE}/about/`, 200, page()),
    }).crawl;

    expect(occurrencesOf(crawl)?.map((o) => o.pageUrl)).toEqual([`${SITE}/about`]);
  });

  it.each([
    ['404', respond(`${SITE}/about/`, 404, '')],
    ['a redirect', respond(`${SITE}/about/`, 301, '', { location: '/about' })],
    ['non HTML', respond(`${SITE}/about/`, 200, 'x', { 'content-type': 'text/plain' })],
  ])('raises nothing when the variant answers %s', async (_label, variantReply) => {
    const crawl = await startScenario({ ...onlyAboutLinked, [`${SITE}/about/`]: variantReply })
      .crawl;

    expect(occurrencesOf(crawl)).toEqual([]);
  });

  it('raises nothing when both forms declare the same canonical', async () => {
    const canonical = page(`${SITE}/about`);
    const crawl = await startScenario({
      ...onlyAboutLinked,
      [`${SITE}/about`]: respond(`${SITE}/about`, 200, canonical),
      [`${SITE}/about/`]: respond(`${SITE}/about/`, 200, canonical),
    }).crawl;

    expect(occurrencesOf(crawl)).toEqual([]);
  });

  it('sends no request to a variant forbidden by robots.txt', async () => {
    const { events, crawl } = startScenario({
      ...onlyAboutLinked,
      [`${SITE}/robots.txt`]: respond(
        `${SITE}/robots.txt`,
        200,
        'User-agent: *\nDisallow: /about/',
        { 'content-type': 'text/plain' },
      ),
    });

    expect(occurrencesOf(await crawl)).toEqual([]);
    expect(events).not.toContain(`get ${SITE}/about/`);
  });

  it('sends no probe for a variant that is already explored', async () => {
    const { events, crawl } = startScenario({
      ...onlyAboutLinked,
      [`${SITE}/`]: respond(`${SITE}/`, 200, page(undefined, '/about', '/about/')),
    });
    await crawl;

    expect(events.filter((event) => event === `get ${SITE}/about/`)).toHaveLength(1);
  });

  it('sends no probe for a variant that is queued beyond the limit', async () => {
    const { events, crawl } = startScenario(
      {
        ...onlyAboutLinked,
        [`${SITE}/`]: respond(`${SITE}/`, 200, page(undefined, '/about', '/about/')),
      },
      2,
    );
    await crawl;

    expect(events).not.toContain(`get ${SITE}/about/`);
  });

  it('sends no probe for the root page', async () => {
    const { events, crawl } = startScenario({ [`${SITE}/`]: respond(`${SITE}/`, 200, page()) });
    await crawl;

    const rootRequests = events.filter((event) => event === `get ${SITE}/`);
    expect(rootRequests).toHaveLength(1);
  });

  it('sends at most one probe per HTML page, each after the politeness delay', async () => {
    const { events, crawl } = startScenario(onlyAboutLinked, 100, 250);
    await crawl;

    const probeIndex = events.indexOf(`get ${SITE}/about/`);
    expect(events[probeIndex - 1]).toBe('sleep 250');
    expect(events.filter((event) => event.startsWith(`get ${SITE}/about`))).toHaveLength(2);
  });

  it('records a network error on the probe without raising an occurrence', async () => {
    const crawl = await startScenario({
      ...onlyAboutLinked,
      [`${SITE}/about/`]: { url: `${SITE}/about/`, kind: 'timeout', message: 'timed out' },
    }).crawl;

    expect(crawl.slashProbes).toEqual([
      {
        url: `${SITE}/about/`,
        sourcePageUrl: `${SITE}/about`,
        status: null,
        error: 'timeout',
        isHtml: false,
        canonical: null,
      },
    ]);
    expect(occurrencesOf(crawl)).toEqual([]);
  });
});
