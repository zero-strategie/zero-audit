import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BfsCrawler } from '../../src/application/bfs-crawler.js';
import { CheerioHtmlParser } from '../../src/infrastructure/cheerio-html-parser.js';
import { FastXmlSitemapReader } from '../../src/infrastructure/fast-xml-sitemap-reader.js';
import { RobotsParserAdapter } from '../../src/infrastructure/robots-parser-adapter.js';
import { SqliteSnapshotRepository } from '../../src/infrastructure/sqlite/sqlite-snapshot-repository.js';
import { SystemClock } from '../../src/infrastructure/system-clock.js';
import { UndiciHttpClient } from '../../src/infrastructure/undici-http-client.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';

const HTML = { 'content-type': 'text/html; charset=utf-8' };
const HOME = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width"><title>Home</title></head>
<body><main><a href="/data.json">d</a><a href="/missing">m</a><a href="/private/x">p</a>
<img src="/a.png"></main></body></html>`;

describe('BfsCrawler html facts', () => {
  let server: FixtureServer;

  beforeEach(async () => {
    server = await startFixtureServer({
      '/': { status: 200, headers: HTML, body: HOME },
      '/data.json': { status: 200, headers: { 'content-type': 'application/json' }, body: '{}' },
      '/robots.txt': {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'User-agent: *\nDisallow: /private/',
      },
    });
  });

  afterEach(async () => {
    await server.close();
  });

  const crawl = () =>
    new BfsCrawler({
      http: new UndiciHttpClient({ clock: new SystemClock(), userAgent: 'test' }),
      robotsFactory: new RobotsParserAdapter(),
      sitemapReader: new FastXmlSitemapReader(),
      htmlParser: new CheerioHtmlParser(),
      clock: new SystemClock(),
      sleeper: { sleep: () => Promise.resolve() },
    }).crawl({ rootUrl: `${server.baseUrl}/`, limit: 10, delayMs: 0 });

  it('copies the parsed facts into the html page and leaves other pages at null', async () => {
    const { pages, blockedPages } = await crawl();
    const byPath = (path: string) => pages.find((p) => p.url === `${server.baseUrl}${path}`);

    const facts = byPath('/')?.htmlFacts;
    expect(Object.keys(facts ?? {}).sort()).toEqual([
      'canonicalCount',
      'charset',
      'declaredFeeds',
      'hasDoctype',
      'hasFrames',
      'hreflang',
      'htmlBytes',
      'imagesWithoutAlt',
      'insecureResources',
      'jsonLd',
      'lang',
      'malformedLinks',
      'metaRefresh',
      'semanticElements',
      'viewport',
    ]);
    expect(facts).toMatchObject({
      viewport: 'width=device-width',
      charset: 'utf-8',
      hasDoctype: true,
      lang: 'fr',
      canonicalCount: 0,
      metaRefresh: null,
      imagesWithoutAlt: { total: 1, examples: ['/a.png'] },
      hasFrames: false,
      semanticElements: ['main'],
      hreflang: [],
      declaredFeeds: [],
    });
    expect(byPath('/data.json')?.htmlFacts).toBeNull();
    expect(byPath('/missing')?.htmlFacts).toBeNull();
    expect(blockedPages).toEqual([
      expect.objectContaining({ blockedByRobots: true, htmlFacts: null }),
    ]);
  });

  it('gives back the same facts after a sqlite round trip', async () => {
    const { pages } = await crawl();
    const repository = SqliteSnapshotRepository.open(':memory:');
    const startedAt = new Date('2026-01-01T00:00:00.000Z');
    const project = await repository.projects.findOrCreateByRootUrl({
      ownerId: null,
      rootUrl: `${server.baseUrl}/`,
      createdAt: startedAt,
    });
    const { id } = await repository.create({
      launchedBy: null,
      projectId: project.id,
      pagesLimit: 10,
      startedAt,
    });
    await repository.addPages(id, pages);

    const details = await repository.getById(id);

    expect(details?.pages.map((p) => p.htmlFacts)).toEqual(pages.map((p) => p.htmlFacts));
    expect(pages[0]?.htmlFacts).not.toBeNull();
  });

  it('sends no extra request for the facts', async () => {
    await crawl();
    const paths = server.requests.map((r) => r.path).sort();

    expect(paths).toEqual([
      '/',
      '/data.json',
      '/llms.txt',
      '/missing',
      '/robots.txt',
      '/sitemap.xml',
    ]);
  });
});
