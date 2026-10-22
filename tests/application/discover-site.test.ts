import { describe, expect, it } from 'vitest';
import { DiscoverSite } from '../../src/application/discover-site.js';
import type {
  HttpClient,
  HttpResponse,
  NetworkFailure,
} from '../../src/application/ports/http-client.js';
import { RobotsParserAdapter } from '../../src/infrastructure/robots-parser-adapter.js';
import { FastXmlSitemapReader } from '../../src/infrastructure/fast-xml-sitemap-reader.js';

const ROOT = 'https://exemple.com/';
const HOST = 'exemple.com';
const NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';

type Reply = { status: number; body?: string } | 'network-error';

class FakeHttpClient implements HttpClient {
  readonly requested: string[] = [];

  constructor(private readonly replies: Readonly<Record<string, Reply>>) {}

  get(url: string): Promise<HttpResponse | NetworkFailure> {
    this.requested.push(url);
    const reply = this.replies[url] ?? { status: 404 };
    if (reply === 'network-error') {
      return Promise.resolve({ url, kind: 'connection', message: 'refused' });
    }
    return Promise.resolve({
      url,
      status: reply.status,
      headers: {},
      body: reply.body ?? '',
      truncated: false,
      responseTimeMs: 1,
    });
  }
}

const urlset = (...locs: string[]) =>
  `<urlset ${NS}>${locs.map((loc) => `<url><loc>${loc}</loc></url>`).join('')}</urlset>`;
const index = (...locs: string[]) =>
  `<sitemapindex ${NS}>${locs.map((loc) => `<sitemap><loc>${loc}</loc></sitemap>`).join('')}</sitemapindex>`;

const discover = async (replies: Record<string, Reply>) => {
  const http = new FakeHttpClient(replies);
  const useCase = new DiscoverSite({
    http,
    robotsFactory: new RobotsParserAdapter(),
    sitemapReader: new FastXmlSitemapReader(),
  });
  return { http, result: await useCase.execute(ROOT, HOST) };
};

describe('DiscoverSite robots.txt', () => {
  it('applies the rules of a found robots.txt', async () => {
    const { result } = await discover({
      'https://exemple.com/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /private' },
    });

    expect(result.robotsFound).toBe(true);
    expect(result.robotsPolicy.isAllowed('https://exemple.com/private/x')).toBe(false);
  });

  it('allows everything when robots.txt is a 404', async () => {
    const { result } = await discover({});

    expect(result.robotsFound).toBe(false);
    expect(result.robotsPolicy.isAllowed('https://exemple.com/private/x')).toBe(true);
  });

  it.each<[string, Reply]>([
    ['a 500', { status: 500, body: 'User-agent: *\nDisallow: /' }],
    ['a network error', 'network-error'],
  ])('treats %s on robots.txt as absent and keeps discovering', async (_label, reply) => {
    const { result } = await discover({
      'https://exemple.com/robots.txt': reply,
      'https://exemple.com/sitemap.xml': { status: 200, body: urlset('https://exemple.com/a') },
    });

    expect(result.robotsFound).toBe(false);
    expect(result.robotsPolicy.isAllowed('https://exemple.com/a')).toBe(true);
    expect(result.sitemapUrls).toEqual(['https://exemple.com/a']);
  });
});

describe('DiscoverSite sitemaps', () => {
  it('reads the sitemaps declared in robots.txt and skips /sitemap.xml', async () => {
    const { http, result } = await discover({
      'https://exemple.com/robots.txt': {
        status: 200,
        body: 'User-agent: *\nSitemap: https://exemple.com/s1.xml\nSitemap: https://exemple.com/s2.xml',
      },
      'https://exemple.com/s1.xml': { status: 200, body: urlset('https://exemple.com/one') },
      'https://exemple.com/s2.xml': { status: 200, body: urlset('https://exemple.com/two') },
    });

    expect(result.sitemapUrls).toEqual(['https://exemple.com/one', 'https://exemple.com/two']);
    expect(http.requested).not.toContain('https://exemple.com/sitemap.xml');
  });

  it('falls back to /sitemap.xml when robots.txt declares none', async () => {
    const { result } = await discover({
      'https://exemple.com/robots.txt': { status: 200, body: 'User-agent: *\nDisallow:' },
      'https://exemple.com/sitemap.xml': { status: 200, body: urlset('https://exemple.com/a') },
    });

    expect(result.sitemapFound).toBe(true);
    expect(result.sitemapUrls).toEqual(['https://exemple.com/a']);
  });

  it('follows one level of sitemap index and ignores a nested index', async () => {
    const { http, result } = await discover({
      'https://exemple.com/sitemap.xml': {
        status: 200,
        body: index('https://exemple.com/simple.xml', 'https://exemple.com/nested.xml'),
      },
      'https://exemple.com/simple.xml': { status: 200, body: urlset('https://exemple.com/a') },
      'https://exemple.com/nested.xml': {
        status: 200,
        body: index('https://exemple.com/deep.xml'),
      },
      'https://exemple.com/deep.xml': { status: 200, body: urlset('https://exemple.com/deep') },
    });

    expect(result.sitemapUrls).toEqual(['https://exemple.com/a']);
    expect(http.requested).not.toContain('https://exemple.com/deep.xml');
  });

  it('drops URLs of another host and duplicates', async () => {
    const { result } = await discover({
      'https://exemple.com/sitemap.xml': {
        status: 200,
        body: urlset(
          'https://exemple.com/a',
          'https://autre.com/b',
          'https://exemple.com/a',
          'https://exemple.com/c#frag',
        ),
      },
    });

    expect(result.sitemapUrls).toEqual(['https://exemple.com/a', 'https://exemple.com/c']);
  });

  it('reports no sitemap when everything is a 404', async () => {
    const { result } = await discover({});

    expect(result).toMatchObject({ sitemapFound: false, sitemapUrls: [] });
  });

  it('reports no sitemap and does not throw on invalid XML', async () => {
    const { result } = await discover({
      'https://exemple.com/sitemap.xml': { status: 200, body: '<urlset><url></urlset>' },
    });

    expect(result).toMatchObject({ sitemapFound: false, sitemapUrls: [] });
  });

  it('ignores a .gz sitemap without requesting it', async () => {
    const { http, result } = await discover({
      'https://exemple.com/robots.txt': {
        status: 200,
        body: 'User-agent: *\nSitemap: https://exemple.com/sitemap.xml.gz',
      },
    });

    expect(http.requested).not.toContain('https://exemple.com/sitemap.xml.gz');
    expect(result.sitemapFound).toBe(false);
  });

  it('does not request a sitemap hosted on another host', async () => {
    const { http } = await discover({
      'https://exemple.com/robots.txt': {
        status: 200,
        body: 'User-agent: *\nSitemap: https://autre.com/sitemap.xml',
      },
    });

    expect(http.requested).not.toContain('https://autre.com/sitemap.xml');
  });
});

describe('DiscoverSite technical files', () => {
  it('records robots.txt, sitemap.xml and llms.txt with their absolute URL and status', async () => {
    const { result } = await discover({
      'https://exemple.com/robots.txt': { status: 200, body: 'User-agent: *\nDisallow:' },
      'https://exemple.com/sitemap.xml': { status: 200, body: urlset('https://exemple.com/a') },
    });

    expect(result.siteFiles).toEqual([
      {
        kind: 'robots',
        url: 'https://exemple.com/robots.txt',
        status: 200,
        error: null,
        facts: null,
      },
      {
        kind: 'sitemap',
        url: 'https://exemple.com/sitemap.xml',
        status: 200,
        error: null,
        facts: null,
      },
      { kind: 'llms', url: 'https://exemple.com/llms.txt', status: 404, error: null, facts: null },
    ]);
  });

  it('records each declared sitemap with its own status and does not add /sitemap.xml', async () => {
    const { http, result } = await discover({
      'https://exemple.com/robots.txt': {
        status: 200,
        body: 'User-agent: *\nSitemap: https://exemple.com/s1.xml\nSitemap: https://exemple.com/s2.xml',
      },
      'https://exemple.com/s1.xml': { status: 200, body: urlset('https://exemple.com/one') },
    });

    expect(result.siteFiles.filter(({ kind }) => kind === 'sitemap')).toEqual([
      { kind: 'sitemap', url: 'https://exemple.com/s1.xml', status: 200, error: null, facts: null },
      { kind: 'sitemap', url: 'https://exemple.com/s2.xml', status: 404, error: null, facts: null },
    ]);
    expect(http.requested).not.toContain('https://exemple.com/sitemap.xml');
  });

  it('records a network failure as a null status with its error kind', async () => {
    const { result } = await discover({ 'https://exemple.com/llms.txt': 'network-error' });

    expect(result.siteFiles).toContainEqual({
      kind: 'llms',
      url: 'https://exemple.com/llms.txt',
      status: null,
      error: 'connection',
      facts: null,
    });
  });

  it('does not record child sitemaps of an index', async () => {
    const { result } = await discover({
      'https://exemple.com/sitemap.xml': { status: 200, body: index('https://exemple.com/c.xml') },
      'https://exemple.com/c.xml': { status: 200, body: urlset('https://exemple.com/a') },
    });

    expect(result.siteFiles.filter(({ kind }) => kind === 'sitemap')).toHaveLength(1);
  });
});
