import { describe, expect, it } from 'vitest';
import { BfsCrawler } from '../../src/application/bfs-crawler.js';
import type {
  HttpClient,
  HttpResponse,
  NetworkFailure,
} from '../../src/application/ports/http-client.js';
import { RobotsParserAdapter } from '../../src/infrastructure/robots-parser-adapter.js';
import { CheerioHtmlParser } from '../../src/infrastructure/cheerio-html-parser.js';
import { FastXmlSitemapReader } from '../../src/infrastructure/fast-xml-sitemap-reader.js';

const HOME_HTML = '<html><body><a href="/a">a</a></body></html>';

const respond = (
  url: string,
  status: number,
  body = '<html></html>',
  headers: Record<string, string> = { 'content-type': 'text/html' },
): HttpResponse => ({ url, status, headers, body, truncated: false, responseTimeMs: 0 });

/** Records every request in order, together with the sleeps, so that ordering is observable. */
const startScenario = (replies: Readonly<Record<string, HttpResponse | NetworkFailure>>) => {
  const events: string[] = [];
  const http: HttpClient = {
    get: (url) => {
      events.push(`get ${url}`);
      return Promise.resolve(replies[url] ?? respond(url, 404, ''));
    },
  };
  const crawl = (rootUrl: string) =>
    new BfsCrawler({
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
    }).crawl({ rootUrl, limit: 100, delayMs: 250 });
  return { events, crawl };
};

describe('alternate host probe', () => {
  it('requests the home page of the www host once, after the last crawled page', async () => {
    const { events, crawl } = startScenario({
      'https://x.test/': respond('https://x.test/', 200, HOME_HTML),
      'https://x.test/a': respond('https://x.test/a', 200),
      'https://www.x.test/': respond(
        'https://www.x.test/',
        200,
        '<html><head><link rel="canonical" href="https://www.x.test/"></head></html>',
      ),
    });

    const result = await crawl('https://x.test');

    const probes = events.filter((event) => event.includes('www.x.test'));
    expect(probes).toEqual(['get https://www.x.test/']);
    expect(events.at(-1)).toBe('get https://www.x.test/');
    expect(events.at(-2)).toBe('sleep 250');
    expect(result.hostProbe).toEqual({
      url: 'https://www.x.test/',
      status: 200,
      error: null,
      isHtml: true,
      canonical: 'https://www.x.test/',
    });
    expect(result.pages.map(({ url }) => url)).toEqual(['https://x.test/', 'https://x.test/a']);
  });

  it('probes the apex host when the root is on www', async () => {
    const { events, crawl } = startScenario({
      'https://www.x.test/': respond('https://www.x.test/', 200),
    });

    const result = await crawl('https://www.x.test/');

    expect(result.hostProbe?.url).toBe('https://x.test/');
    expect(events.filter((event) => event === 'get https://x.test/')).toHaveLength(1);
  });

  it('records a redirect of the alternate host without following it', async () => {
    const { crawl } = startScenario({
      'https://x.test/': respond('https://x.test/', 200),
      'https://www.x.test/': respond('https://www.x.test/', 301, '', {
        location: 'https://x.test/',
      }),
    });

    const result = await crawl('https://x.test/');

    expect(result.hostProbe).toMatchObject({ status: 301, isHtml: false });
  });

  it('records a network failure and still completes the crawl', async () => {
    const { crawl } = startScenario({
      'https://x.test/': respond('https://x.test/', 200),
      'https://www.x.test/': { url: 'https://www.x.test/', kind: 'dns', message: 'ENOTFOUND' },
    });

    const result = await crawl('https://x.test/');

    expect(result.hostProbe).toEqual({
      url: 'https://www.x.test/',
      status: null,
      error: 'dns',
      isHtml: false,
      canonical: null,
    });
    expect(result.pages).toHaveLength(1);
  });

  it.each(['http://127.0.0.1:8080/', 'http://localhost:8080/'])(
    'sends no probe when the root host is %s',
    async (root) => {
      const { events, crawl } = startScenario({ [root]: respond(root, 200) });

      const result = await crawl(root);

      expect(result.hostProbe).toBeNull();
      expect(events.filter((event) => event.startsWith('get '))).toEqual([
        `get ${root}`,
        `get ${root}robots.txt`,
        `get ${root}sitemap.xml`,
        `get ${root}llms.txt`,
      ]);
    },
  );
});
