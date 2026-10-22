import { describe, expect, it } from 'vitest';
import type { CheckResult } from '../../../src/domain/check.js';
import type { CrawlResult, Link, Page, SiteFile } from '../../../src/domain/crawl.js';
import { siteChecks } from '../../../src/domain/checks/site/index.js';
import {
  expectCatalogueMetadata,
  expectNoCatalogueTitleCopied,
  crawlOf,
  flaggedUrls,
  makeLink,
  makePage,
  runCheck,
  u,
} from '../../support/check-fixtures.js';

const CUSTOM_ID_MIN = 1000;

const run = (checkId: number, pages: Page[], links: Link[] = []): CheckResult =>
  runCheck(siteChecks, checkId, crawlOf(pages, links));

describe('check 6 (duplicate title)', () => {
  it('flags both pages sharing a title, each pointing to the other', () => {
    const result = run(6, [
      makePage(u('a'), { title: 'Accueil' }),
      makePage(u('b'), { title: 'Accueil' }),
      makePage(u('c'), { title: 'Contact' }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('a'), u('b')]);
    expect(result.occurrences.map((o) => o.info)).toEqual([
      { duplicates: [u('b')] },
      { duplicates: [u('a')] },
    ]);
    expect(result.examined).toBe(3);
  });

  it('lists duplicates in a stable order whatever the crawl order', () => {
    const titled = (path: string) => makePage(u(path), { title: 'Accueil' });
    const forward = run(6, [titled('a'), titled('b'), titled('c')]);
    const backward = run(6, [titled('c'), titled('b'), titled('a')]);

    const infoOf = (result: CheckResult, url: string) =>
      result.occurrences.find((o) => o.pageUrl === url)?.info;
    expect(infoOf(backward, u('a'))).toEqual(infoOf(forward, u('a')));
    expect(infoOf(backward, u('a'))).toEqual({ duplicates: [u('b'), u('c')] });
  });

  it('never treats missing or empty titles as duplicates', () => {
    const result = run(6, [
      makePage(u('a'), { title: null }),
      makePage(u('b'), { title: '' }),
      makePage(u('c'), { title: '   ' }),
    ]);
    expect(result.count).toBe(0);
  });

  it('ignores whitespace differences but stays case sensitive', () => {
    const result = run(6, [
      makePage(u('a'), { title: ' Accueil  du site ' }),
      makePage(u('b'), { title: 'Accueil du site' }),
      makePage(u('c'), { title: 'accueil du site' }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('a'), u('b')]);
  });

  it('ignores pages that are not HTML 2xx', () => {
    const result = run(6, [
      makePage(u('a'), { title: 'Erreur' }),
      makePage(u('b'), { title: 'Erreur', status: 404 }),
    ]);
    expect(result.count).toBe(0);
    expect(result.examined).toBe(1);
  });
});

describe('check 15 (duplicate meta description)', () => {
  it('flags pages sharing a description, never null or empty ones', () => {
    const result = run(15, [
      makePage(u('a'), { metaDescription: 'Même texte' }),
      makePage(u('b'), { metaDescription: 'Même texte' }),
      makePage(u('c'), { metaDescription: 'Autre texte' }),
      makePage(u('d'), { metaDescription: null }),
      makePage(u('e'), { metaDescription: '' }),
      makePage(u('f'), { metaDescription: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('a'), u('b')]);
    expect(result.occurrences[0]?.info).toEqual({ duplicates: [u('b')] });
    expect(result.examined).toBe(6);
  });
});

describe('check 8 (broken internal links)', () => {
  const target = (name: string, overrides: Partial<Page>): Page => makePage(u(name), overrides);

  it('reports one occurrence per distinct broken target with its status', () => {
    const result = run(
      8,
      [makePage(u('a')), target('absente', { status: 404 }), target('erreur', { status: 500 })],
      [
        makeLink(u('a'), u('absente')),
        makeLink(u('a'), u('absente')),
        makeLink(u('a'), u('erreur')),
      ],
    );
    expect(flaggedUrls(result)).toEqual([u('a'), u('a')]);
    expect(result.occurrences.map((o) => o.info)).toEqual([
      { targetUrl: u('absente'), status: 404, error: null },
      { targetUrl: u('erreur'), status: 500, error: null },
    ]);
  });

  it('reports a network error target with the error type', () => {
    const result = run(
      8,
      [makePage(u('a')), target('down', { status: null, error: 'ECONNRESET', isHtml: false })],
      [makeLink(u('a'), u('down'))],
    );
    expect(result.occurrences.map((o) => o.info)).toEqual([
      { targetUrl: u('down'), status: null, error: 'ECONNRESET' },
    ]);
  });

  it('ignores redirects, never-requested targets, and non-internal links', () => {
    const result = run(
      8,
      [makePage(u('a')), target('old', { status: 301 }), target('x', { status: 404 })],
      [
        makeLink(u('a'), u('old')),
        makeLink(u('a'), u('jamais')),
        makeLink(u('a'), u('x'), { type: 'external' }),
        makeLink(u('a'), u('x'), { type: 'resource' }),
      ],
    );
    expect(result.count).toBe(0);
  });

  it('examines the pages having at least one internal link', () => {
    const result = run(8, [makePage(u('a')), makePage(u('b'))], [makeLink(u('a'), u('b'))]);
    expect(result.examined).toBe(1);
  });
});

describe('check 125 (sitemap missing)', () => {
  it('flags the site when no sitemap was found', () => {
    const missing = runCheck(
      siteChecks,
      125,
      crawlOf([], [], { robotsFound: true, sitemapFound: false }),
    );
    const found = runCheck(
      siteChecks,
      125,
      crawlOf([], [], { robotsFound: false, sitemapFound: true }),
    );
    expect(missing).toMatchObject({ count: 1, examined: 1 });
    expect(found).toMatchObject({ count: 0, examined: 1 });
  });
});

describe('check 124 (sitemap not declared in robots.txt)', () => {
  const declared = (count: number): SiteFile =>
    robotsFile({ invalidLines: [], invalidCount: 0, sitemapDeclarations: count });
  const crawlWith = (
    files: SiteFile[],
    site: { robotsFound: boolean; sitemapFound: boolean },
  ): CrawlResult => crawlOf([], [], site, null, [], [], files);

  it('flags a found sitemap when robots.txt has no Sitemap line', () => {
    const result = runCheck(
      siteChecks,
      124,
      crawlWith([declared(0)], { robotsFound: true, sitemapFound: true }),
    );

    expect(result.occurrences).toEqual([{ checkId: 124, pageUrl: null, info: {} }]);
  });

  it.each([
    ['robots.txt declares a sitemap', [declared(1)], { robotsFound: true, sitemapFound: true }],
    ['robots.txt is absent', [robotsFile(null, 404)], { robotsFound: false, sitemapFound: true }],
    ['no sitemap was found', [declared(0)], { robotsFound: true, sitemapFound: false }],
  ])('does not flag when %s', (_label, files, site) => {
    expect(runCheck(siteChecks, 124, crawlWith(files, site)).count).toBe(0);
  });
});

describe('check 17 (invalid sitemap)', () => {
  const sitemapFile = (facts: SiteFile['facts']): SiteFile => ({
    kind: 'sitemap',
    url: u('sitemap.xml'),
    status: 200,
    error: null,
    facts,
  });
  const facts = (overrides: Record<string, unknown> = {}): SiteFile['facts'] => ({
    malformedXml: false,
    truncated: false,
    issues: { total: 0, examples: [] },
    ...overrides,
  });
  const run17 = (file: SiteFile): CheckResult =>
    runCheck(
      siteChecks,
      17,
      crawlOf([], [], { robotsFound: true, sitemapFound: true }, null, [], [], [file]),
    );

  it('emits an occurrence with the schema issues of the sitemap', () => {
    const issues = {
      total: 1,
      examples: [{ type: 'missing-loc', source: u('sitemap.xml'), loc: null, value: null }],
    };

    const result = run17(sitemapFile(facts({ issues })));

    expect(result.occurrences).toEqual([
      {
        checkId: 17,
        pageUrl: null,
        info: { sitemap: u('sitemap.xml'), malformedXml: false, issues },
      },
    ]);
  });

  it('flags malformed XML even without schema issues (125 may report it too)', () => {
    const result = run17(sitemapFile(facts({ malformedXml: true })));

    expect(result.occurrences.map((o) => o.info)).toEqual([
      expect.objectContaining({ malformedXml: true }),
    ]);
  });

  it.each([
    [
      'a truncated sitemap',
      sitemapFile(facts({ truncated: true, issues: { total: 2, examples: [] } })),
    ],
    ['a conforming sitemap', sitemapFile(facts())],
    ['facts that are null', sitemapFile(null)],
  ])('does not flag %s', (_label, file) => {
    expect(run17(file).count).toBe(0);
  });
});

describe('check 43 (oversized sitemap)', () => {
  const MAX_URLS = 50_000;
  const MAX_BYTES = 52_428_800;
  const facts = (overrides: Record<string, unknown> = {}): SiteFile['facts'] => ({
    truncated: false,
    urlCount: 10,
    maxUrlCount: 10,
    contentLength: null,
    contentEncoding: null,
    ...overrides,
  });
  const run43 = (overrides: Record<string, unknown> | null): CheckResult =>
    runCheck(
      siteChecks,
      43,
      crawlOf(
        [],
        [],
        { robotsFound: true, sitemapFound: true },
        null,
        [],
        [],
        [
          {
            kind: 'sitemap',
            url: u('sitemap.xml'),
            status: 200,
            error: null,
            facts: overrides === null ? null : facts(overrides),
          },
        ],
      ),
    );

  it('flags a sitemap listing one URL more than the limit, not one at the limit', () => {
    const over = run43({ urlCount: MAX_URLS + 1, maxUrlCount: MAX_URLS + 1 });

    expect(over.occurrences).toEqual([
      {
        checkId: 43,
        pageUrl: null,
        info: {
          sitemap: u('sitemap.xml'),
          urlCount: MAX_URLS + 1,
          maxUrlCount: MAX_URLS + 1,
          truncated: false,
        },
      },
    ]);
    expect(run43({ maxUrlCount: MAX_URLS }).count).toBe(0);
  });

  it('does not flag an index whose files are each within the limit, however many URLs it totals', () => {
    expect(run43({ urlCount: 2 * MAX_URLS, maxUrlCount: MAX_URLS }).count).toBe(0);
  });

  it('flags a declared content-length above 50 MiB when the body is not encoded', () => {
    const result = run43({ contentLength: MAX_BYTES + 1 });

    expect(result.occurrences.map((o) => o.info)).toEqual([
      expect.objectContaining({ bytes: MAX_BYTES + 1 }),
    ]);
    expect(run43({ contentLength: MAX_BYTES }).count).toBe(0);
  });

  it('ignores a content-length that describes a compressed body', () => {
    expect(run43({ contentLength: MAX_BYTES + 1, contentEncoding: 'gzip' }).count).toBe(0);
  });

  it('flags a truncated sitemap and says at least 5 MiB were received', () => {
    const result = run43({ truncated: true });

    expect(result.occurrences.map((o) => o.info)).toEqual([
      expect.objectContaining({ truncated: true, note: 'au moins 5 Mio reçus' }),
    ]);
  });

  it('does not flag a small sitemap or facts that are null', () => {
    expect(run43({}).count).toBe(0);
    expect(run43(null).count).toBe(0);
  });
});

describe('check 203 (robots.txt missing)', () => {
  it('flags the site when no robots.txt was found', () => {
    const missing = runCheck(
      siteChecks,
      203,
      crawlOf([], [], { robotsFound: false, sitemapFound: true }),
    );
    const found = runCheck(
      siteChecks,
      203,
      crawlOf([], [], { robotsFound: true, sitemapFound: false }),
    );
    expect(missing).toMatchObject({ count: 1, examined: 1 });
    expect(found).toMatchObject({ count: 0, examined: 1 });
  });
});

describe('check 213 (single incoming internal link)', () => {
  it('flags a page linked by exactly one distinct source, with that source', () => {
    const result = run(
      213,
      ['a', 'b', 'c', 'd', 'e'].map((n) => makePage(u(n))),
      [
        makeLink(u('a'), u('b')),
        makeLink(u('a'), u('b')),
        makeLink(u('a'), u('c')),
        makeLink(u('d'), u('c')),
        makeLink(u('e'), u('e')),
      ],
    );
    expect(flaggedUrls(result)).toEqual([u('b')]);
    expect(result.occurrences[0]?.info).toEqual({ sourceUrl: u('a') });
    expect(result.examined).toBe(5);
  });

  it('does not flag a page without incoming links', () => {
    expect(run(213, [makePage(u('a'))]).count).toBe(0);
  });

  it('ignores external and resource links', () => {
    const result = run(
      213,
      [makePage(u('a')), makePage(u('b'))],
      [
        makeLink(u('a'), u('b'), { type: 'external' }),
        makeLink(u('a'), u('b'), { type: 'resource' }),
      ],
    );
    expect(result.count).toBe(0);
  });

  it('counts the root like any other HTML 2xx page', () => {
    const result = run(
      213,
      [makePage('https://exemple.com/'), makePage(u('a'))],
      [makeLink(u('a'), 'https://exemple.com/')],
    );
    expect(flaggedUrls(result)).toEqual(['https://exemple.com/']);
    expect(result.examined).toBe(2);
  });
});

const llmsCrawl = (siteFiles: SiteFile[]): CrawlResult => ({
  ...crawlOf([makePage(u(''))]),
  siteFiles,
});

const llmsFile = (status: number | null, error: string | null = null): SiteFile => ({
  kind: 'llms',
  url: u('llms.txt'),
  status,
  error,
  facts: null,
});

describe('check 137 (llms.txt missing)', () => {
  it.each([
    ['404', llmsFile(404)],
    ['301', llmsFile(301)],
    ['500', llmsFile(500)],
    ['network error', llmsFile(null, 'ECONNREFUSED')],
  ])('flags a llms file answered with %s', (_label, file) => {
    const result = runCheck(siteChecks, 137, llmsCrawl([file]));
    expect(result.occurrences).toEqual([{ checkId: 137, pageUrl: null, info: {} }]);
  });

  it('does not flag a llms file answered with 200', () => {
    expect(runCheck(siteChecks, 137, llmsCrawl([llmsFile(200)])).count).toBe(0);
  });

  it('does not flag a snapshot recorded without any llms row', () => {
    const robots: SiteFile = {
      kind: 'robots',
      url: u('robots.txt'),
      status: 404,
      error: null,
      facts: null,
    };
    expect(runCheck(siteChecks, 137, llmsCrawl([robots])).count).toBe(0);
  });
});

const robotsFile = (facts: SiteFile['facts'], status: number | null = 200): SiteFile => ({
  kind: 'robots',
  url: u('robots.txt'),
  status,
  error: null,
  facts,
});

const robotsCrawl = (files: SiteFile[]): CrawlResult =>
  crawlOf([], [], { robotsFound: true, sitemapFound: false }, null, [], [], files);

describe('check 16 (invalid robots.txt)', () => {
  it('emits a single occurrence listing the invalid lines with number and text', () => {
    const lines = [
      { number: 2, text: 'bogus' },
      { number: 5, text: 'Noindex: /x' },
    ];
    const facts = { invalidLines: lines, invalidCount: 2, sitemapDeclarations: 0 };

    const result = runCheck(siteChecks, 16, robotsCrawl([robotsFile(facts)]));

    expect(result.occurrences).toEqual([{ checkId: 16, pageUrl: null, info: { lines } }]);
  });

  it.each([
    ['a valid file', robotsFile({ invalidLines: [], invalidCount: 0, sitemapDeclarations: 1 })],
    ['an absent file', robotsFile(null, 404)],
    ['facts that are null', robotsFile(null)],
  ])('does not flag %s', (_label, file) => {
    expect(runCheck(siteChecks, 16, robotsCrawl([file])).count).toBe(0);
  });

  it('does not flag a snapshot without any robots row', () => {
    expect(runCheck(siteChecks, 16, robotsCrawl([])).count).toBe(0);
  });
});

describe('check 205 (HSTS missing)', () => {
  const HSTS = { 'strict-transport-security': 'max-age=31536000' };
  const home = (url: string, overrides: Partial<Page> = {}): Page =>
    makePage(url, { depth: 0, ...overrides });
  const run205 = (pages: Page[]): CheckResult => runCheck(siteChecks, 205, crawlOf(pages));

  it('flags an https home page answered with 200 and no HSTS header', () => {
    const result = run205([home('https://exemple.com/')]);
    expect(result.occurrences).toEqual([
      { checkId: 205, pageUrl: 'https://exemple.com/', info: {} },
    ]);
  });

  it('does not flag an https home page sending HSTS', () => {
    expect(run205([home('https://exemple.com/', { headers: HSTS })]).count).toBe(0);
  });

  it('does not apply to an http home page', () => {
    expect(run205([home('http://exemple.com/')]).count).toBe(0);
  });

  it('does not apply to an https home page with a non 2xx status', () => {
    expect(run205([home('https://exemple.com/', { status: 301 })]).count).toBe(0);
  });

  it('ignores deeper pages', () => {
    const result = run205([
      home('https://exemple.com/', { headers: HSTS }),
      makePage(u('inner'), { depth: 1 }),
    ]);
    expect(result.count).toBe(0);
  });
});

describe('check 7 (identical content)', () => {
  const hashed = (path: string, contentHash: string | null, overrides: Partial<Page> = {}) =>
    makePage(u(path), { contentHash, ...overrides });

  it('flags both pages sharing a content hash without canonical, each pointing to the other', () => {
    const result = run(7, [hashed('a', 'h1'), hashed('b', 'h1'), hashed('c', 'h2')]);
    expect(flaggedUrls(result)).toEqual([u('a'), u('b')]);
    expect(result.occurrences.map((o) => o.info)).toEqual([
      { duplicates: [u('b')] },
      { duplicates: [u('a')] },
    ]);
    expect(result.examined).toBe(3);
  });

  it('ignores a group whose pages all declare the same canonical once normalised', () => {
    const result = run(7, [
      hashed('a', 'h1', { canonical: `${u('main')}#top` }),
      hashed('b', 'h1', { canonical: u('main') }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
  });

  it('flags a group whose canonicals differ or are partly missing', () => {
    const differing = run(7, [
      hashed('a', 'h1', { canonical: u('x') }),
      hashed('b', 'h1', { canonical: u('y') }),
    ]);
    const partial = run(7, [hashed('a', 'h1', { canonical: u('x') }), hashed('b', 'h1')]);
    expect(flaggedUrls(differing)).toEqual([u('a'), u('b')]);
    expect(flaggedUrls(partial)).toEqual([u('a'), u('b')]);
  });

  it('never treats different or missing hashes as identical', () => {
    const result = run(7, [
      hashed('a', null),
      hashed('b', null),
      hashed('c', 'h1'),
      hashed('d', 'h2'),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
  });

  it('does not count an error page in a group', () => {
    const result = run(7, [hashed('a', 'h1'), hashed('b', 'h1', { status: 404 })]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(1);
  });
});

describe('registry metadata', () => {
  it('uses the id and severity of the catalogue', () => {
    expectCatalogueMetadata(
      siteChecks.filter((check) => check.id < CUSTOM_ID_MIN),
      {
        6: 'error',
        7: 'error',
        8: 'error',
        15: 'error',
        16: 'error',
        17: 'error',
        43: 'error',
        124: 'warning',
        125: 'warning',
        137: 'notice',
        205: 'notice',
        203: 'notice',
        213: 'notice',
      },
    );
  });

  it('registers the custom check 1000 in the reserved id range', () => {
    expect(siteChecks.map((check) => check.id)).toContain(1000);
  });

  it('never copies a catalogue title', () => {
    expectNoCatalogueTitleCopied(siteChecks);
  });
});
