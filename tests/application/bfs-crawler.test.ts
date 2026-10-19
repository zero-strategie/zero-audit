import { describe, expect, it } from 'vitest';
import { BfsCrawler, type CrawlRequest } from '../../src/application/bfs-crawler.js';
import type {
  HttpClient,
  HttpResponse,
  NetworkFailure,
} from '../../src/application/ports/http-client.js';
import { RootUnreachable } from '../../src/domain/errors.js';
import { CheerioHtmlParser } from '../../src/infrastructure/cheerio-html-parser.js';
import { FastXmlSitemapReader } from '../../src/infrastructure/fast-xml-sitemap-reader.js';
import { RobotsParserAdapter } from '../../src/infrastructure/robots-parser-adapter.js';
import { SystemClock } from '../../src/infrastructure/system-clock.js';
import { UndiciHttpClient } from '../../src/infrastructure/undici-http-client.js';
import { startFixtureServer } from '../support/fixture-server.js';

const SITE = 'http://site.test';
const NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';

type Reply = { status: number; headers?: Record<string, string>; body?: string } | 'timeout';

const page = (...hrefs: string[]): Reply => ({
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: `<html><body>${hrefs.map((href) => `<a href="${href}">link</a>`).join('')}</body></html>`,
});
const redirect = (to: string, status = 301): Reply => ({ status, headers: { location: to } });
const text = (body: string): Reply => ({
  status: 200,
  headers: { 'content-type': 'text/plain' },
  body,
});
const sitemap = (...locs: string[]): Reply => ({
  status: 200,
  body: `<urlset ${NS}>${locs.map((loc) => `<url><loc>${loc}</loc></url>`).join('')}</urlset>`,
});

class FakeClock {
  private current = 0;
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

class FakeSite implements HttpClient {
  readonly requested: string[] = [];

  constructor(
    private readonly replies: Readonly<Record<string, Reply>>,
    private readonly clock = new FakeClock(),
    private readonly elapseMs = 0,
  ) {}

  get(url: string): Promise<HttpResponse | NetworkFailure> {
    this.requested.push(url);
    this.clock.advance(this.elapseMs);
    const reply = this.replies[url] ?? { status: 404 };
    if (reply === 'timeout') return Promise.resolve({ url, kind: 'timeout', message: 'timed out' });
    return Promise.resolve({
      url,
      status: reply.status,
      headers: reply.headers ?? {},
      body: reply.body ?? '',
      truncated: false,
      responseTimeMs: 0,
    });
  }

  get pagesRequested(): string[] {
    return this.requested.filter(
      (url) => !url.endsWith('/robots.txt') && !url.endsWith('/sitemap.xml'),
    );
  }
}

const crawl = async (
  replies: Record<string, Reply>,
  overrides: Partial<CrawlRequest> = {},
  elapseMs = 0,
) => {
  const clock = new FakeClock();
  const site = new FakeSite(replies, clock, elapseMs);
  const sleeps: number[] = [];
  const crawler = new BfsCrawler({
    http: site,
    robotsFactory: new RobotsParserAdapter(),
    sitemapReader: new FastXmlSitemapReader(),
    htmlParser: new CheerioHtmlParser(),
    clock,
    sleeper: {
      sleep: (ms) => {
        sleeps.push(ms);
        clock.advance(ms);
        return Promise.resolve();
      },
    },
  });
  const result = await crawler.crawl({
    rootUrl: `${SITE}/`,
    limit: 100,
    delayMs: 0,
    ...overrides,
  });
  return { site, sleeps, result };
};

const pageAt = (result: Awaited<ReturnType<typeof crawl>>['result'], path: string) =>
  result.pages.find((candidate) => candidate.url === `${SITE}${path}`);

describe('BfsCrawler traversal', () => {
  it('requests pages breadth first with their depth', async () => {
    const { site, result } = await crawl({
      [`${SITE}/`]: page('/a', '/b'),
      [`${SITE}/a`]: page('/c'),
      [`${SITE}/b`]: page(),
      [`${SITE}/c`]: page(),
    });

    expect(site.pagesRequested).toEqual(['/', '/a', '/b', '/c'].map((path) => `${SITE}${path}`));
    expect(result.pages.map((p) => p.depth)).toEqual([0, 1, 1, 2]);
  });

  it('stops at the page limit', async () => {
    const { site, result } = await crawl(
      {
        [`${SITE}/`]: page('/a', '/b', '/c', '/d'),
        [`${SITE}/a`]: page(),
        [`${SITE}/b`]: page(),
      },
      { limit: 2 },
    );

    expect(site.pagesRequested).toHaveLength(2);
    expect(result.pages).toHaveLength(2);
  });

  it('requests each normalized URL only once', async () => {
    const { site } = await crawl({
      [`${SITE}/`]: page('/a', '/a#x'),
      [`${SITE}/a`]: page('/', '/a#y'),
    });

    expect(site.pagesRequested).toEqual([`${SITE}/`, `${SITE}/a`]);
  });

  it('never requests URLs disallowed by robots.txt and does not count them', async () => {
    const { site, result } = await crawl(
      {
        [`${SITE}/robots.txt`]: text('User-agent: *\nDisallow: /private'),
        [`${SITE}/`]: page('/private/x', '/a'),
        [`${SITE}/a`]: page(),
      },
      { limit: 2 },
    );

    expect(site.requested).not.toContain(`${SITE}/private/x`);
    expect(result.pages.map((p) => p.url)).toEqual([`${SITE}/`, `${SITE}/a`]);
  });

  it('never requests an external host, even a loopback alias', async () => {
    const { site } = await crawl(
      {
        'http://127.0.0.1:9/': page('http://localhost:9/ext', '/a'),
        'http://127.0.0.1:9/a': page(),
      },
      { rootUrl: 'http://127.0.0.1:9/' },
    );

    expect(site.requested.some((url) => url.includes('localhost'))).toBe(false);
  });

  it('records internal and external links of crawled pages', async () => {
    const { result } = await crawl({
      [`${SITE}/`]: page('/a', 'https://other.test/x'),
      [`${SITE}/a`]: page(),
    });

    expect(result.links.map((l) => [l.targetUrl, l.type])).toEqual([
      [`${SITE}/a`, 'internal'],
      ['https://other.test/x', 'external'],
    ]);
  });

  it('records resources as links without requesting them or counting them in the limit', async () => {
    const { site, result } = await crawl(
      {
        [`${SITE}/`]: {
          status: 200,
          headers: { 'content-type': 'text/html' },
          body: '<img src="/i.png"><script src="/j.js"></script><link rel="stylesheet" href="/s.css"><a href="/a">a</a>',
        },
        [`${SITE}/a`]: page(),
      },
      { limit: 2 },
    );

    expect(site.pagesRequested).toEqual([`${SITE}/`, `${SITE}/a`]);
    expect(result.links.filter((l) => l.type === 'resource')).toHaveLength(3);
  });

  it('stores extracted metadata on successful html pages only', async () => {
    const { result } = await crawl({
      [`${SITE}/`]: {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<title>T</title><h1>H</h1><body> un deux <a href="/gone">x</a></body>',
      },
      [`${SITE}/gone`]: {
        status: 404,
        headers: { 'content-type': 'text/html' },
        body: '<title>Missing</title>',
      },
    });

    expect(pageAt(result, '/')).toMatchObject({ title: 'T', h1: ['H'], wordCount: 4 });
    expect(pageAt(result, '/')?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(pageAt(result, '/gone')).toMatchObject({ title: null, wordCount: null });
  });

  it('requests sitemap URLs after the root with depth 1', async () => {
    const { site, result } = await crawl({
      [`${SITE}/`]: page(),
      [`${SITE}/sitemap.xml`]: sitemap(`${SITE}/hidden`),
      [`${SITE}/hidden`]: page(),
    });

    expect(site.pagesRequested).toEqual([`${SITE}/`, `${SITE}/hidden`]);
    expect(pageAt(result, '/hidden')?.depth).toBe(1);
    expect(result.site).toEqual({ robotsFound: false, sitemapFound: true });
  });
});

describe('BfsCrawler redirects', () => {
  it('records a redirect and requests its target as a distinct counted URL', async () => {
    const { result } = await crawl({
      [`${SITE}/`]: page('/old'),
      [`${SITE}/old`]: redirect('/new'),
      [`${SITE}/new`]: page(),
    });

    const old = pageAt(result, '/old');
    expect(old?.status).toBe(301);
    expect(old?.redirectTarget).toBe(`${SITE}/new`);
    expect(old?.redirectChain).toEqual([`${SITE}/new`]);
    expect(pageAt(result, '/new')?.depth).toBe(2);
  });

  it('adopts the host of the final root URL as the internal host', async () => {
    const { site, result } = await crawl(
      {
        'http://127.0.0.1:9/': redirect('http://localhost:9/'),
        'http://localhost:9/': page('http://localhost:9/a'),
        'http://localhost:9/a': page(),
      },
      { rootUrl: 'http://127.0.0.1:9/' },
    );

    expect(result.internalHost).toBe('localhost');
    expect(site.pagesRequested).toContain('http://localhost:9/a');
  });

  it('requests each URL of a redirect loop once and terminates', async () => {
    const { site } = await crawl({
      [`${SITE}/`]: page('/x'),
      [`${SITE}/x`]: redirect('/y'),
      [`${SITE}/y`]: redirect('/x'),
    });

    expect(site.pagesRequested.filter((url) => url.endsWith('/x'))).toHaveLength(1);
    expect(site.pagesRequested.filter((url) => url.endsWith('/y'))).toHaveLength(1);
  });

  it('caps the recorded redirect chain at 10 hops', async () => {
    const replies: Record<string, Reply> = {};
    for (let i = 0; i < 12; i++) replies[`${SITE}/r${String(i)}`] = redirect(`/r${String(i + 1)}`);
    replies[`${SITE}/r12`] = page();

    const { result } = await crawl(replies, { rootUrl: `${SITE}/r0` });

    expect(pageAt(result, '/r0')?.redirectChain).toHaveLength(10);
  });
});

describe('BfsCrawler politeness', () => {
  it('sleeps the configured delay between requests and never before the first', async () => {
    const { site, sleeps } = await crawl(
      { [`${SITE}/`]: page('/a', '/b'), [`${SITE}/a`]: page(), [`${SITE}/b`]: page() },
      { delayMs: 1000 },
    );

    expect(sleeps).toHaveLength(site.requested.length - 1);
    expect(sleeps.every((ms) => ms === 1000)).toBe(true);
  });

  it('uses the larger of the configured delay and the robots.txt Crawl-delay', async () => {
    const robots = { [`${SITE}/robots.txt`]: text('User-agent: *\nCrawl-delay: 3') };
    const longer = await crawl({ ...robots, [`${SITE}/`]: page('/a') }, { delayMs: 1000 });
    const shorter = await crawl(
      { [`${SITE}/robots.txt`]: text('User-agent: *\nCrawl-delay: 1'), [`${SITE}/`]: page('/a') },
      { delayMs: 5000 },
    );

    expect(longer.sleeps.at(-1)).toBe(3000);
    expect(shorter.sleeps.every((ms) => ms === 5000)).toBe(true);
  });
});

describe('BfsCrawler responses', () => {
  it('records a network error as a null status and carries on', async () => {
    const { result } = await crawl({
      [`${SITE}/`]: page('/slow', '/ok'),
      [`${SITE}/slow`]: 'timeout',
      [`${SITE}/ok`]: page(),
    });

    expect(pageAt(result, '/slow')).toMatchObject({ status: null, error: 'timeout' });
    expect(pageAt(result, '/ok')?.status).toBe(200);
  });

  it('throws RootUnreachable when the root cannot be reached', async () => {
    const fixture = await startFixtureServer({});
    await fixture.close();
    const crawler = new BfsCrawler({
      http: new UndiciHttpClient({ clock: new SystemClock(), userAgent: 'test' }),
      robotsFactory: new RobotsParserAdapter(),
      sitemapReader: new FastXmlSitemapReader(),
      htmlParser: new CheerioHtmlParser(),
      clock: new SystemClock(),
      sleeper: { sleep: () => Promise.resolve() },
    });

    await expect(
      crawler.crawl({ rootUrl: `${fixture.baseUrl}/`, limit: 10, delayMs: 0 }),
    ).rejects.toBeInstanceOf(RootUnreachable);
  });

  it('throws RootUnreachable when the root redirects to an unreachable URL', async () => {
    await expect(
      crawl({ [`${SITE}/`]: redirect('https://down.test/'), 'https://down.test/': 'timeout' }),
    ).rejects.toBeInstanceOf(RootUnreachable);
  });

  it('flags non-HTML responses and does not parse their body', async () => {
    const { site, result } = await crawl({
      [`${SITE}/`]: page('/logo.png'),
      [`${SITE}/logo.png`]: {
        status: 200,
        headers: { 'content-type': 'image/png' },
        body: '<a href="/trap">x</a>',
      },
    });

    expect(pageAt(result, '/logo.png')?.isHtml).toBe(false);
    expect(site.requested).not.toContain(`${SITE}/trap`);
  });

  it('keeps only the retained response headers', async () => {
    const { result } = await crawl({
      [`${SITE}/`]: {
        status: 200,
        headers: {
          'content-type': 'text/html',
          'cache-control': 'max-age=60',
          'set-cookie': 'a=b',
          'x-powered-by': 'php',
        },
        body: '',
      },
    });

    expect(result.pages[0]?.headers).toEqual({
      'content-type': 'text/html',
      'cache-control': 'max-age=60',
    });
  });

  it('measures the response time with the clock', async () => {
    const { result } = await crawl({ [`${SITE}/`]: page() }, {}, 120);

    expect(result.pages[0]?.responseTimeMs).toBe(120);
  });

  it('excludes the politeness delay from the response time', async () => {
    const { result } = await crawl(
      { [`${SITE}/`]: page('/a'), [`${SITE}/a`]: page() },
      { delayMs: 1000 },
      120,
    );

    expect(result.pages.map((candidate) => candidate.responseTimeMs)).toEqual([120, 120]);
  });

  it('reports progress after each page', async () => {
    const progress: [number, number][] = [];

    await crawl(
      { [`${SITE}/`]: page('/a'), [`${SITE}/a`]: page() },
      { limit: 50, onProgress: (crawled, limit) => progress.push([crawled, limit]) },
    );

    expect(progress).toEqual([
      [1, 50],
      [2, 50],
    ]);
  });
});
