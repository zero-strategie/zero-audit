import { describe, expect, it } from 'vitest';
import type { CheckResult } from '../../../src/domain/check.js';
import type { Link, Page } from '../../../src/domain/crawl.js';
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

describe('registry metadata', () => {
  it('uses the id and severity of the catalogue', () => {
    expectCatalogueMetadata(siteChecks, {
      6: 'error',
      8: 'error',
      15: 'error',
      125: 'warning',
      203: 'notice',
      213: 'notice',
    });
  });

  it('never copies a catalogue title', () => {
    expectNoCatalogueTitleCopied(siteChecks);
  });
});
