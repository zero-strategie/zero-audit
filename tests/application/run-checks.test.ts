import { describe, expect, it } from 'vitest';
import { runChecks } from '../../src/application/run-checks.js';
import { CheckRegistry, type PageCheck, type SiteCheck } from '../../src/domain/check.js';
import type { CrawlResult, Page } from '../../src/domain/crawl.js';
import { DomainError } from '../../src/domain/errors.js';

const makePage = (url: string, overrides: Partial<Page> = {}): Page => ({
  url,
  depth: 0,
  status: 200,
  error: null,
  redirectTarget: null,
  redirectChain: [],
  headers: {},
  responseTimeMs: 10,
  contentType: 'text/html',
  isHtml: true,
  title: null,
  metaDescription: null,
  canonical: null,
  h1: [],
  wordCount: null,
  textRatio: null,
  contentHash: null,
  blockedByRobots: false,
  ...overrides,
});

const crawl: CrawlResult = {
  rootUrl: 'https://exemple.com/',
  internalHost: 'exemple.com',
  pages: [
    makePage('https://exemple.com/'),
    makePage('https://exemple.com/a'),
    makePage('https://exemple.com/img.png', { isHtml: false }),
  ],
  blockedPages: [],
  links: [],
  siteFiles: [],
  hostProbe: null,
  slashProbes: [],
  site: { robotsFound: false, sitemapFound: false },
};

const pageCheck = (id: number, flagged: readonly string[]): PageCheck => ({
  id,
  severity: 'error',
  theme: 'other',
  scope: 'page',
  label: `fake ${String(id)}`,
  applies: (page) => page.isHtml,
  run: () => flagged.map((pageUrl) => ({ checkId: id, pageUrl, info: { reason: 'fake' } })),
});

const siteCheck = (id: number, flagged: boolean): SiteCheck => ({
  id,
  severity: 'warning',
  theme: 'other',
  scope: 'site',
  label: `site ${String(id)}`,
  run: () => (flagged ? [{ checkId: id, pageUrl: null, info: {} }] : []),
});

describe('runChecks', () => {
  it('counts flagged pages and examines only the pages where the check applies', () => {
    const registry = new CheckRegistry([pageCheck(1, ['https://exemple.com/a'])]);

    const [result] = runChecks(crawl, registry);

    expect(result).toMatchObject({
      checkId: 1,
      severity: 'error',
      theme: 'other',
      count: 1,
      examined: 2,
    });
    expect(result?.occurrences).toEqual([
      { checkId: 1, pageUrl: 'https://exemple.com/a', info: { reason: 'fake' } },
    ]);
  });

  it('reports checks without occurrences with a zero count', () => {
    const [result] = runChecks(crawl, new CheckRegistry([pageCheck(1, [])]));

    expect(result?.count).toBe(0);
    expect(result?.occurrences).toEqual([]);
  });

  it('examines a site-wide check as a single unit', () => {
    const [clean, flagged] = runChecks(
      crawl,
      new CheckRegistry([siteCheck(125, false), siteCheck(203, true)]),
    );

    expect(clean).toMatchObject({ examined: 1, count: 0 });
    expect(flagged).toMatchObject({ examined: 1, count: 1 });
  });

  it('returns one result per check sorted by ascending id', () => {
    const registry = new CheckRegistry([
      pageCheck(15, []),
      siteCheck(2, false),
      pageCheck(106, []),
    ]);

    expect(runChecks(crawl, registry).map((result) => result.checkId)).toEqual([2, 15, 106]);
  });
});

describe('CheckRegistry', () => {
  it('rejects two checks sharing the same id', () => {
    expect(() => new CheckRegistry([pageCheck(1, []), siteCheck(1, false)])).toThrow(DomainError);
  });
});
