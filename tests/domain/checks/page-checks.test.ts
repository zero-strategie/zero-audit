import { describe, expect, it } from 'vitest';
import type { CheckResult } from '../../../src/domain/check.js';
import type { Link, Page } from '../../../src/domain/crawl.js';
import { pageChecks } from '../../../src/domain/checks/page/index.js';
import {
  crawlOf,
  makeLink,
  expectCatalogueMetadata,
  expectNoCatalogueTitleCopied,
  flaggedUrls,
  makePage,
  runCheck,
  u,
} from '../../support/check-fixtures.js';

const run = (checkId: number, pages: Page[]): CheckResult =>
  runCheck(pageChecks, checkId, crawlOf(pages));

const titleOfLength = (n: number): string => 'a'.repeat(n);

describe('check 1 (5xx)', () => {
  it('flags 5xx pages and examines pages that received an HTTP response', () => {
    const result = run(1, [
      makePage(u('ok')),
      makePage(u('nf'), { status: 404 }),
      makePage(u('down'), { status: 503 }),
      makePage(u('net'), { status: null, error: 'ECONNRESET', isHtml: false }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('down')]);
    expect(result.examined).toBe(3);
  });
});

describe('check 2 (4xx)', () => {
  it('flags only 4xx pages with their code and examines pages that received a response', () => {
    const result = run(2, [
      makePage(u('ok')),
      makePage(u('nf'), { status: 404 }),
      makePage(u('down'), { status: 503 }),
      makePage(u('moved'), { status: 301 }),
      makePage(u('net'), { status: null, error: 'ECONNRESET', isHtml: false }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('nf')]);
    expect(result.occurrences[0]?.info).toEqual({ status: 404 });
    expect(result.examined).toBe(4);
  });
});

describe('check 4 (blocked by robots.txt)', () => {
  const blocked = (name: string): Page =>
    makePage(name, { status: null, isHtml: false, blockedByRobots: true });

  it('emits one occurrence per blocked URL', () => {
    const result = runCheck(
      pageChecks,
      4,
      crawlOf([makePage(u('a'))], [], undefined, null, [], [blocked(u('p1')), blocked(u('p2'))]),
    );
    expect(flaggedUrls(result)).toEqual([u('p1'), u('p2')]);
  });

  it('emits nothing when no page is blocked', () => {
    expect(run(4, [makePage(u('a'))]).count).toBe(0);
  });

  it('examines the explored pages, not the blocked ones', () => {
    const result = runCheck(
      pageChecks,
      4,
      crawlOf(
        [makePage(u('a')), makePage(u('b')), makePage(u('c'))],
        [],
        undefined,
        null,
        [],
        [blocked(u('p1'))],
      ),
    );
    expect(result.examined).toBe(3);
  });
});

describe('checks 9 and 11 (unreachable pages)', () => {
  const failed = (name: string, error: string): Page =>
    makePage(name, { status: null, isHtml: false, error });

  it('flags a timeout in check 9 only', () => {
    const pages = [failed(u('slow'), 'timeout'), makePage(u('ok'))];
    expect(flaggedUrls(run(9, pages))).toEqual([u('slow')]);
    expect(run(11, pages).count).toBe(0);
  });

  it.each(['connection', 'dns', 'blocked', 'other'])(
    'flags %s in check 11 with its kind, and not in check 9',
    (kind) => {
      const pages = [failed(u('down'), kind)];
      const result = run(11, pages);
      expect(flaggedUrls(result)).toEqual([u('down')]);
      expect(result.occurrences[0]?.info).toEqual({ kind });
      expect(run(9, pages).count).toBe(0);
    },
  );

  it('ignores pages that got an HTTP response, including 404', () => {
    const pages = [makePage(u('a')), makePage(u('b'), { status: 404 })];
    expect(run(9, pages).count).toBe(0);
    expect(run(11, pages).count).toBe(0);
  });

  it('examines every explored page', () => {
    const pages = [failed(u('a'), 'timeout'), makePage(u('b')), makePage(u('c'))];
    expect(run(9, pages).examined).toBe(3);
    expect(run(11, pages).examined).toBe(3);
  });
});

describe('checks 109 and 214 (redirects)', () => {
  const redirect = (name: string, status: number): Page =>
    makePage(name, { status, isHtml: false, redirectTarget: u('target') });

  it.each([302, 303, 307])('flags a %i in check 109 with its status and target', (status) => {
    const result = run(109, [redirect(u('a'), status), makePage(u('b'))]);
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.occurrences[0]?.info).toEqual({ status, target: u('target') });
    expect(run(214, [redirect(u('a'), status)]).count).toBe(0);
  });

  it.each([301, 308])('flags a %i in check 214 and not in check 109', (status) => {
    const pages = [redirect(u('a'), status)];
    const result = run(214, pages);
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.occurrences[0]?.info).toEqual({ status, target: u('target') });
    expect(run(109, pages).count).toBe(0);
  });

  it('ignores 200, 304 and network errors', () => {
    const pages = [
      makePage(u('ok')),
      makePage(u('cached'), { status: 304, isHtml: false }),
      makePage(u('down'), { status: null, isHtml: false, error: 'dns' }),
    ];
    expect(run(109, pages).count).toBe(0);
    expect(run(214, pages).count).toBe(0);
  });

  it('examines the pages that got an HTTP response', () => {
    const pages = [
      redirect(u('a'), 301),
      makePage(u('b')),
      makePage(u('down'), { status: null, isHtml: false, error: 'dns' }),
    ];
    expect(run(109, pages).examined).toBe(2);
    expect(run(214, pages).examined).toBe(2);
  });
});

describe('check 33 (redirect chains and loops)', () => {
  const hop = (name: string, target: string, status = 301): Page =>
    makePage(name, { status, isHtml: false, redirectTarget: target });

  it('flags every redirecting URL with at least 2 hops, listing the chain in order', () => {
    const result = run(33, [
      hop(u('x'), u('a')),
      hop(u('a'), u('b')),
      hop(u('b'), u('c')),
      makePage(u('c')),
    ]);
    expect(flaggedUrls(result)).toEqual([u('x'), u('a')]);
    expect(result.occurrences[0]?.info).toEqual({
      chain: [u('a'), u('b'), u('c')],
      loop: false,
    });
    expect(result.occurrences[1]?.info).toEqual({ chain: [u('b'), u('c')], loop: false });
  });

  it('flags every URL of a loop with loop = true', () => {
    const result = run(33, [hop(u('a'), u('b'), 302), hop(u('b'), u('a'))]);
    expect(flaggedUrls(result)).toEqual([u('a'), u('b')]);
    expect(result.occurrences.map((o) => o.info['loop'])).toEqual([true, true]);
  });

  it('flags a page redirecting to itself', () => {
    const result = run(33, [hop(u('a'), u('a'))]);
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.occurrences[0]?.info).toEqual({ chain: [u('a')], loop: true });
  });

  it('marks a chain reaching the 10 hop cap as truncated', () => {
    const pages = Array.from({ length: 12 }, (_, i) =>
      hop(u(`p${String(i)}`), u(`p${String(i + 1)}`)),
    );
    const first = run(33, pages).occurrences[0];
    expect(first?.pageUrl).toBe(u('p0'));
    expect(first?.info['truncated']).toBe(true);
    expect(first?.info['chain']).toHaveLength(10);
  });

  it('ignores a single redirect', () => {
    const result = run(33, [hop(u('a'), u('b')), makePage(u('b'))]);
    expect(result.count).toBe(0);
  });

  it('examines the redirecting pages only', () => {
    const result = run(33, [hop(u('a'), u('b')), makePage(u('b')), makePage(u('c'))]);
    expect(result.examined).toBe(1);
  });
});

describe('check 212 (more than 3 clicks from the home page)', () => {
  const ROOT = 'https://exemple.com/';
  const chain = (...names: string[]): Page[] => names.map((name) => makePage(u(name)));
  const linksAlong = (...urls: string[]) =>
    urls.slice(1).map((target, i) => makeLink(urls[i] ?? ROOT, target));
  const run212 = (pages: Page[], links: Link[], rootUrl = ROOT): CheckResult =>
    runCheck(pageChecks, 212, { ...crawlOf(pages, links), rootUrl });

  it('flags a page at 4 clicks and not one at 3 clicks, with its depth', () => {
    const path = [ROOT, u('a'), u('b'), u('c'), u('d')];
    const result = run212([makePage(ROOT), ...chain('a', 'b', 'c', 'd')], linksAlong(...path));
    expect(flaggedUrls(result)).toEqual([u('d')]);
    expect(result.occurrences[0]?.info).toEqual({ clicks: 4 });
    expect(result.examined).toBe(5);
  });

  it('uses link clicks and not the crawl depth recorded from the sitemap', () => {
    const path = [ROOT, u('a'), u('b'), u('c'), u('d')];
    const pages = [makePage(ROOT), ...chain('a', 'b', 'c'), makePage(u('d'), { depth: 1 })];
    expect(flaggedUrls(run212(pages, linksAlong(...path)))).toEqual([u('d')]);
  });

  it('does not flag a page that no link leads to', () => {
    const result = run212([makePage(ROOT), makePage(u('sitemap-only'), { depth: 1 })], []);
    expect(result.count).toBe(0);
  });

  it('counts from the final root and not from the redirecting start URL', () => {
    const start = 'http://exemple.com/';
    const path = [ROOT, u('a'), u('b'), u('c'), u('d')];
    const pages = [
      makePage(start, { status: 301, isHtml: false, redirectTarget: ROOT }),
      makePage(ROOT),
      ...chain('a', 'b', 'c', 'd'),
    ];
    const result = run212(pages, linksAlong(...path), start);
    expect(flaggedUrls(result)).toEqual([u('d')]);
    expect(result.occurrences[0]?.info).toEqual({ clicks: 4 });
  });

  it('flags a page at 4 clicks when the start URL has no trailing slash', () => {
    const path = [ROOT, u('a'), u('b'), u('c'), u('d')];
    const pages = [makePage(ROOT), ...chain('a', 'b', 'c', 'd')];
    expect(flaggedUrls(run212(pages, linksAlong(...path), 'https://exemple.com'))).toEqual([
      u('d'),
    ]);
  });

  it('flags only HTML 2xx pages', () => {
    const path = [ROOT, u('a'), u('b'), u('c'), u('d')];
    const pages = [
      makePage(ROOT),
      ...chain('a', 'b', 'c'),
      makePage(u('d'), { status: 404, isHtml: false }),
    ];
    const result = run212(pages, linksAlong(...path));
    expect(result.count).toBe(0);
    expect(result.examined).toBe(4);
  });
});

describe('check 209 (X-Robots-Tag noindex)', () => {
  const withHeader = (name: string, value: string): Page =>
    makePage(u(name), { headers: { 'x-robots-tag': value } });

  it('flags noindex among several directives, with the header value', () => {
    const result = run(209, [withHeader('a', 'noindex, nofollow')]);
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.occurrences[0]?.info).toEqual({ value: 'noindex, nofollow' });
  });

  it('ignores an agent prefix and the case', () => {
    expect(flaggedUrls(run(209, [withHeader('a', 'googlebot: NOINDEX')]))).toEqual([u('a')]);
  });

  it('flags none', () => {
    expect(flaggedUrls(run(209, [withHeader('a', 'none')]))).toEqual([u('a')]);
  });

  it('does not flag nofollow alone, another directive, or a missing header', () => {
    const result = run(209, [
      withHeader('nofollow', 'nofollow'),
      withHeader('noarchive', 'noarchive, nosnippet'),
      makePage(u('none-header')),
    ]);
    expect(result.count).toBe(0);
  });

  it('does not examine pages that got no HTTP response', () => {
    const result = run(209, [
      makePage(u('ok')),
      makePage(u('net'), { status: null, isHtml: false, error: 'dns' }),
    ]);
    expect(result.examined).toBe(1);
  });
});

describe('check 38 (canonical pointing to an error page)', () => {
  const withCanonical = (name: string, canonical: string | null): Page =>
    makePage(u(name), { canonical });

  it('flags a canonical to a 404 page with the canonical and its status', () => {
    const result = run(38, [
      withCanonical('a', u('gone')),
      makePage(u('gone'), { status: 404, isHtml: false }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.occurrences[0]?.info).toEqual({ canonical: u('gone'), status: 404 });
    expect(result.examined).toBe(1);
  });

  it('flags a canonical to a 5xx page or to a network failure', () => {
    const result = run(38, [
      withCanonical('a', u('down')),
      withCanonical('b', u('net')),
      makePage(u('down'), { status: 503, isHtml: false }),
      makePage(u('net'), { status: null, error: 'timeout', isHtml: false }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('a'), u('b')]);
    expect(result.occurrences[1]?.info).toEqual({ canonical: u('net'), status: null });
  });

  it('matches the canonical after removing its fragment', () => {
    const result = run(38, [
      withCanonical('a', `${u('gone')}#top`),
      makePage(u('gone'), { status: 404, isHtml: false }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('a')]);
  });

  it('ignores canonicals to a 200 page, to itself, to a redirect or to an uncrawled URL', () => {
    const result = run(38, [
      withCanonical('ok', u('fine')),
      withCanonical('self', u('self')),
      withCanonical('moved', u('redirect')),
      withCanonical('unknown', u('never-crawled')),
      withCanonical('none', null),
      makePage(u('fine')),
      makePage(u('redirect'), { status: 301, isHtml: false }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(4);
  });

  it('does not examine error pages even if they declare a canonical', () => {
    const result = run(38, [
      makePage(u('a'), { status: 404, isHtml: false, canonical: u('gone') }),
      makePage(u('gone'), { status: 404, isHtml: false }),
    ]);
    expect(result.examined).toBe(0);
    expect(result.count).toBe(0);
  });
});

describe('check 113 (too many URL parameters)', () => {
  it('flags URLs with more than 2 query parameters, counting repeated keys', () => {
    const result = run(113, [
      makePage(`${u('p')}?a=1&b=2&c=3`),
      makePage(`${u('q')}?a=1&a=2&b=3`),
      makePage(`${u('r')}?a=1&b=2`),
      makePage(u('s')),
    ]);
    expect(flaggedUrls(result)).toEqual([`${u('p')}?a=1&b=2&c=3`, `${u('q')}?a=1&a=2&b=3`]);
    expect(result.occurrences[0]?.info).toEqual({ count: 3 });
    expect(result.examined).toBe(4);
  });

  it('examines every crawled page, including error pages', () => {
    const result = run(113, [
      makePage(`${u('x')}?a=1&b=2&c=3&d=4`, { status: 404, isHtml: false }),
      makePage(u('net'), { status: null, error: 'dns', isHtml: false }),
    ]);
    expect(result.count).toBe(1);
    expect(result.examined).toBe(2);
  });
});

describe('check 122 (underscore in URL path)', () => {
  it('flags an underscore in the path but not in the query string', () => {
    const result = run(122, [
      makePage(u('mon_article')),
      makePage(`${u('mon-article')}?x=a_b`),
      makePage(u('clean')),
    ]);
    expect(flaggedUrls(result)).toEqual([u('mon_article')]);
    expect(result.examined).toBe(3);
  });
});

describe('check 3 (title missing)', () => {
  it('flags null and empty titles on HTML 2xx pages only', () => {
    const result = run(3, [
      makePage(u('null'), { title: null }),
      makePage(u('empty'), { title: '' }),
      makePage(u('ok')),
      makePage(u('nf'), { status: 404, title: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('null'), u('empty')]);
    expect(result.examined).toBe(3);
  });
});

describe('check 101 (title too short)', () => {
  it('flags a 29-character title but not a 30-character one, with the length', () => {
    const result = run(101, [
      makePage(u('29'), { title: titleOfLength(29) }),
      makePage(u('30'), { title: titleOfLength(30) }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('29')]);
    expect(result.occurrences[0]?.info).toEqual({ length: 29 });
  });

  it('counts a page without title as examined but does not flag it', () => {
    const result = run(101, [makePage(u('none'), { title: null })]);
    expect(result.examined).toBe(1);
    expect(result.count).toBe(0);
  });
});

describe('check 102 (title too long)', () => {
  it('flags a 61-character title but not a 60-character one', () => {
    const result = run(102, [
      makePage(u('60'), { title: titleOfLength(60) }),
      makePage(u('61'), { title: titleOfLength(61) }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('61')]);
    expect(result.occurrences[0]?.info).toEqual({ length: 61 });
  });

  it('counts a page without title as examined but does not flag it', () => {
    const result = run(102, [makePage(u('none'), { title: null })]);
    expect(result.examined).toBe(1);
    expect(result.count).toBe(0);
  });
});

describe('check 103 (H1 missing)', () => {
  it('flags the page without H1', () => {
    const result = run(103, [makePage(u('none'), { h1: [] }), makePage(u('one'))]);
    expect(flaggedUrls(result)).toEqual([u('none')]);
    expect(result.examined).toBe(2);
  });
});

describe('check 104 (multiple H1)', () => {
  it('flags the page with 2 H1 and examines pages with at least one', () => {
    const result = run(104, [
      makePage(u('0'), { h1: [] }),
      makePage(u('1'), { h1: ['a'] }),
      makePage(u('2'), { h1: ['a', 'b'] }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('2')]);
    expect(result.occurrences[0]?.info).toEqual({ h1Count: 2 });
    expect(result.examined).toBe(2);
  });
});

describe('check 105 (H1 equals title)', () => {
  it('flags a page whose H1 equals the title once normalized', () => {
    const result = run(105, [makePage(u('a'), { title: 'Accueil  Zero', h1: ['accueil zero'] })]);
    expect(flaggedUrls(result)).toEqual([u('a')]);
  });

  it('flags a page once even when several H1 equal the title', () => {
    const result = run(105, [makePage(u('a'), { title: 'Zero', h1: ['Autre', 'zero', ' ZERO '] })]);
    expect(flaggedUrls(result)).toEqual([u('a')]);
  });

  it('ignores pages without title, without H1 or with different H1', () => {
    const result = run(105, [
      makePage(u('no-title'), { title: null, h1: ['Zero'] }),
      makePage(u('no-h1'), { title: 'Zero', h1: [] }),
      makePage(u('different'), { title: 'Zero', h1: ['Autre'] }),
      makePage(u('non-html'), { isHtml: false, title: 'Zero', h1: ['Zero'] }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(3);
  });
});

describe('check 106 (meta description missing)', () => {
  it('flags null and empty descriptions', () => {
    const result = run(106, [
      makePage(u('null'), { metaDescription: null }),
      makePage(u('empty'), { metaDescription: '' }),
      makePage(u('ok')),
    ]);
    expect(flaggedUrls(result)).toEqual([u('null'), u('empty')]);
    expect(result.examined).toBe(3);
  });
});

describe('check 117 (low word count)', () => {
  it('flags 199 words but not 200, with the word count', () => {
    const result = run(117, [
      makePage(u('199'), { wordCount: 199 }),
      makePage(u('200'), { wordCount: 200 }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('199')]);
    expect(result.occurrences[0]?.info).toEqual({ wordCount: 199 });
  });
});

describe('check 112 (low text ratio)', () => {
  it('flags a ratio of 0.09 but not exactly 0.10, with the ratio', () => {
    const result = run(112, [
      makePage(u('low'), { textRatio: 0.09 }),
      makePage(u('limit'), { textRatio: 0.1 }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('low')]);
    expect(result.occurrences[0]?.info).toEqual({ textRatio: 0.09 });
  });

  it('ignores non-HTML pages, 404 pages and unknown ratios', () => {
    const result = run(112, [
      makePage(u('img'), { isHtml: false, textRatio: null }),
      makePage(u('notfound'), { status: 404, textRatio: 0.01 }),
      makePage(u('old'), { textRatio: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
  });
});

describe('non-HTML resources', () => {
  it('are counted by no content check', () => {
    const image = makePage(u('logo.png'), {
      contentType: 'image/png',
      isHtml: false,
      title: null,
      h1: [],
      metaDescription: null,
      wordCount: null,
      textRatio: null,
    });
    for (const id of [3, 101, 102, 103, 104, 106, 112, 117]) {
      expect(run(id, [image]).examined).toBe(0);
    }
  });
});

describe('registry metadata', () => {
  it('uses the id and severity of the catalogue', () => {
    expectCatalogueMetadata(pageChecks, {
      1: 'error',
      2: 'error',
      3: 'error',
      4: 'notice',
      9: 'error',
      11: 'error',
      18: 'error',
      23: 'error',
      24: 'error',
      25: 'error',
      26: 'error',
      30: 'error',
      31: 'warning',
      33: 'error',
      38: 'error',
      39: 'error',
      40: 'error',
      44: 'error',
      113: 'warning',
      115: 'warning',
      116: 'warning',
      110: 'warning',
      121: 'warning',
      128: 'warning',
      21: 'error',
      220: 'notice',
      222: 'notice',
      114: 'warning',
      122: 'warning',
      129: 'warning',
      136: 'warning',
      201: 'notice',
      109: 'warning',
      111: 'error',
      204: 'notice',
      209: 'notice',
      207: 'notice',
      212: 'notice',
      214: 'notice',
      101: 'warning',
      102: 'warning',
      103: 'warning',
      106: 'warning',
      112: 'warning',
      117: 'warning',
      104: 'notice',
      105: 'warning',
      108: 'warning',
      123: 'warning',
      202: 'notice',
      216: 'notice',
      217: 'notice',
      215: 'notice',
      20: 'error',
      45: 'error',
      46: 'error',
    });
  });

  it('never copies a catalogue title', () => {
    expectNoCatalogueTitleCopied(pageChecks);
  });
});

const urlOfLength = (n: number): string => `${u('')}${'a'.repeat(n - u('').length)}`;

describe('check 136 (URL too long)', () => {
  it('flags URLs from 101 to 200 characters and reports their length', () => {
    const result = run(136, [
      makePage(urlOfLength(100)),
      makePage(urlOfLength(101)),
      makePage(urlOfLength(200)),
      makePage(urlOfLength(201)),
    ]);
    expect(flaggedUrls(result)).toEqual([urlOfLength(101), urlOfLength(200)]);
    expect(result.occurrences.map((o) => o.info)).toEqual([{ length: 101 }, { length: 200 }]);
    expect(result.examined).toBe(4);
  });
});

describe('check 201 (URL over 200 characters)', () => {
  it('flags only URLs longer than 200 characters and reports their length', () => {
    const result = run(201, [
      makePage(urlOfLength(101)),
      makePage(urlOfLength(200)),
      makePage(urlOfLength(201)),
    ]);
    expect(flaggedUrls(result)).toEqual([urlOfLength(201)]);
    expect(result.occurrences[0]?.info).toEqual({ length: 201 });
    expect(result.examined).toBe(3);
  });
});

describe('check 108 (too many links)', () => {
  const linksFrom = (source: string, count: number, type: Link['type'] = 'internal'): Link[] =>
    Array.from({ length: count }, (_, i) => makeLink(source, u(`t${String(i)}`), { type }));

  const runWithLinks = (pages: Page[], links: Link[]): CheckResult =>
    runCheck(pageChecks, 108, crawlOf(pages, links));

  it('flags 3001 links, internal and external, duplicates included, but not 3000', () => {
    const result = runWithLinks(
      [makePage(u('over')), makePage(u('limit'))],
      [
        ...linksFrom(u('over'), 2000),
        ...linksFrom(u('over'), 1000, 'external'),
        makeLink(u('over'), u('t0')),
        ...linksFrom(u('limit'), 3000),
      ],
    );
    expect(flaggedUrls(result)).toEqual([u('over')]);
    expect(result.occurrences[0]?.info).toEqual({ count: 3001 });
  });

  it('does not count resource links', () => {
    const result = runWithLinks(
      [makePage(u('a'))],
      [...linksFrom(u('a'), 2990), ...linksFrom(u('a'), 50, 'resource')],
    );
    expect(flaggedUrls(result)).toEqual([]);
  });

  it('examines HTML 2xx pages only', () => {
    const result = runWithLinks(
      [makePage(u('a')), makePage(u('b'), { status: 404 }), makePage(u('c'), { isHtml: false })],
      [],
    );
    expect(result.examined).toBe(1);
  });
});

describe('nofollow link checks (123 internal, 202 external)', () => {
  const nofollow = (source: string, target: string, overrides: Partial<Link> = {}): Link =>
    makeLink(source, target, { rel: 'nofollow', ...overrides });

  it('emits one occurrence per source page with sorted targets for 123', () => {
    const result = runCheck(
      pageChecks,
      123,
      crawlOf(
        [makePage(u('a')), makePage(u('b'))],
        [nofollow(u('a'), u('z')), nofollow(u('a'), u('m')), makeLink(u('b'), u('m'))],
      ),
    );
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.occurrences[0]?.info).toEqual({ targets: [u('m'), u('z')] });
  });

  it('recognises the nofollow token whatever the case, but not nofollowed', () => {
    const result = runCheck(
      pageChecks,
      123,
      crawlOf(
        [makePage(u('a')), makePage(u('b'))],
        [
          nofollow(u('a'), u('x'), { rel: 'noopener NoFollow' }),
          nofollow(u('b'), u('x'), { rel: 'nofollowed' }),
        ],
      ),
    );
    expect(flaggedUrls(result)).toEqual([u('a')]);
  });

  it('reports an external nofollow link in 202 and not in 123', () => {
    const crawl = crawlOf(
      [makePage(u('a'))],
      [nofollow('https://exemple.com/a', 'https://autre.example/', { type: 'external' })],
    );
    expect(flaggedUrls(runCheck(pageChecks, 202, crawl))).toEqual([u('a')]);
    expect(flaggedUrls(runCheck(pageChecks, 123, crawl))).toEqual([]);
  });

  it('examines HTML 2xx pages that have at least one link of the matching type', () => {
    const pages = [
      makePage(u('internal')),
      makePage(u('external')),
      makePage(u('none')),
      makePage(u('error'), { status: 404 }),
    ];
    const links = [
      makeLink(u('internal'), u('x')),
      makeLink(u('external'), 'https://autre.example/', { type: 'external' }),
      makeLink(u('error'), u('x')),
      makeLink(u('none'), u('img.png'), { type: 'resource' }),
    ];
    const crawl = crawlOf(pages, links);
    expect(runCheck(pageChecks, 123, crawl).examined).toBe(1);
    expect(runCheck(pageChecks, 202, crawl).examined).toBe(1);
  });
});

describe('check 216 (links without anchor text)', () => {
  it('emits one occurrence with sorted targets for null and blank anchors', () => {
    const result = runCheck(
      pageChecks,
      216,
      crawlOf(
        [makePage(u('a'))],
        [
          makeLink(u('a'), u('z'), { anchor: null }),
          makeLink(u('a'), 'https://autre.example/', { type: 'external', anchor: '   ' }),
          makeLink(u('a'), u('ok'), { anchor: 'Texte' }),
        ],
      ),
    );
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.occurrences[0]?.info).toEqual({ targets: ['https://autre.example/', u('z')] });
  });

  it('does not flag a page whose links all have text', () => {
    const result = runCheck(
      pageChecks,
      216,
      crawlOf([makePage(u('a'))], [makeLink(u('a'), u('b'), { anchor: 'Accueil' })]),
    );
    expect(flaggedUrls(result)).toEqual([]);
  });

  it('ignores resource links without anchor and examines only HTML 2xx pages with an <a> link', () => {
    const pages = [
      makePage(u('a')),
      makePage(u('res')),
      makePage(u('none')),
      makePage(u('error'), { status: 404 }),
    ];
    const links = [
      makeLink(u('a'), u('x'), { anchor: 'x' }),
      makeLink(u('res'), u('img.png'), { type: 'resource' }),
      makeLink(u('error'), u('x')),
    ];
    const result = runCheck(pageChecks, 216, crawlOf(pages, links));
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(1);
  });
});

const GENERIC_ANCHORS = [
  'cliquez ici',
  'ici',
  'en savoir plus',
  'lire la suite',
  'voir plus',
  'plus',
  'click here',
  'here',
  'read more',
  'learn more',
  'more',
  'link',
  'lien',
];

describe('check 217 (non-descriptive anchors)', () => {
  const crawlWithAnchor = (anchor: string | null) =>
    crawlOf([makePage(u('a'))], [makeLink(u('a'), u('b'), { anchor })]);

  it('flags a generic anchor after normalising case, spaces and trailing punctuation', () => {
    const result = runCheck(pageChecks, 217, crawlWithAnchor('  En   SAVOIR plus. '));
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.occurrences[0]?.info).toEqual({ targets: [u('b')] });
  });

  it.each(GENERIC_ANCHORS)('recognises the anchor "%s"', (anchor) => {
    expect(flaggedUrls(runCheck(pageChecks, 217, crawlWithAnchor(anchor)))).toEqual([u('a')]);
  });

  it('does not flag an anchor that merely contains a generic phrase', () => {
    const result = runCheck(pageChecks, 217, crawlWithAnchor('en savoir plus sur nos tarifs'));
    expect(flaggedUrls(result)).toEqual([]);
  });

  it.each([null, '', '   '])(
    'does not flag the empty anchor %j (check 216 covers it)',
    (anchor) => {
      expect(flaggedUrls(runCheck(pageChecks, 217, crawlWithAnchor(anchor)))).toEqual([]);
    },
  );

  it('emits one occurrence per page with sorted targets and ignores resources', () => {
    const result = runCheck(
      pageChecks,
      217,
      crawlOf(
        [makePage(u('a')), makePage(u('error'), { status: 404 })],
        [
          makeLink(u('a'), u('z'), { anchor: 'ici' }),
          makeLink(u('a'), u('m'), { anchor: 'Read more' }),
          makeLink(u('a'), u('img.png'), { type: 'resource', anchor: 'here' }),
          makeLink(u('error'), u('x'), { anchor: 'ici' }),
        ],
      ),
    );
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.occurrences[0]?.info).toEqual({ targets: [u('m'), u('z')] });
    expect(result.examined).toBe(1);
  });
});

describe('check 215 (linked resources)', () => {
  const crawlLinking = (target: string, type: Link['type'], targetPage?: Page) =>
    crawlOf(
      [makePage(u('a')), ...(targetPage ? [targetPage] : [])],
      [makeLink(u('a'), target, { type })],
    );
  const resourcePage = (name: string, overrides: Partial<Page> = {}): Page =>
    makePage(name, { contentType: 'application/json', isHtml: false, ...overrides });

  it('flags an internal link to a listed extension, whatever its case', () => {
    const result = runCheck(pageChecks, 215, crawlLinking(u('doc.PDF'), 'internal'));
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.occurrences[0]?.info).toEqual({ targets: [u('doc.PDF')] });
  });

  it('flags an internal link without extension crawled as 200 non-HTML', () => {
    const result = runCheck(
      pageChecks,
      215,
      crawlLinking(u('export'), 'internal', resourcePage(u('export'))),
    );
    expect(flaggedUrls(result)).toEqual([u('a')]);
  });

  it('does not flag an internal link to a non-HTML target that is not a 2xx', () => {
    const result = runCheck(
      pageChecks,
      215,
      crawlLinking(u('export'), 'internal', resourcePage(u('export'), { status: 404 })),
    );
    expect(flaggedUrls(result)).toEqual([]);
  });

  it('judges an external link by its extension only', () => {
    expect(
      flaggedUrls(runCheck(pageChecks, 215, crawlLinking('https://autre.fr/a.zip', 'external'))),
    ).toEqual([u('a')]);
    expect(
      flaggedUrls(runCheck(pageChecks, 215, crawlLinking('https://autre.fr/page', 'external'))),
    ).toEqual([]);
  });

  it('reads the extension on the path, ignoring the query string', () => {
    const result = runCheck(pageChecks, 215, crawlLinking(u('fichier.pdf?x=1'), 'internal'));
    expect(flaggedUrls(result)).toEqual([u('a')]);
  });

  it('does not flag an HTML 200 page without a listed extension', () => {
    const result = runCheck(
      pageChecks,
      215,
      crawlLinking(u('page'), 'internal', makePage(u('page'))),
    );
    expect(flaggedUrls(result)).toEqual([]);
  });

  it('emits one occurrence per page with sorted targets and ignores resource links', () => {
    const result = runCheck(
      pageChecks,
      215,
      crawlOf(
        [makePage(u('a')), makePage(u('error'), { status: 404 }), makePage(u('b'))],
        [
          makeLink(u('a'), u('z.pdf')),
          makeLink(u('a'), u('m.zip')),
          makeLink(u('a'), u('img.png'), { type: 'resource' }),
          makeLink(u('error'), u('x.pdf')),
          makeLink(u('b'), u('img.png'), { type: 'resource' }),
        ],
      ),
    );
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.occurrences[0]?.info).toEqual({ targets: [u('m.zip'), u('z.pdf')] });
    expect(result.examined).toBe(1);
  });
});

describe('check 26 (page served over http)', () => {
  const httpUrl = (name: string): string => `http://exemple.com/${name}`;

  it('flags HTML 2xx pages served over http and examines HTML 2xx pages', () => {
    const result = run(26, [
      makePage(httpUrl('a')),
      makePage(u('secure')),
      makePage(httpUrl('moved'), { status: 301 }),
      makePage(httpUrl('file'), { isHtml: false, contentType: 'application/pdf' }),
    ]);
    expect(flaggedUrls(result)).toEqual([httpUrl('a')]);
    expect(result.examined).toBe(2);
  });
});

describe('check 31 (http links on an https site)', () => {
  const httpUrl = (name: string): string => `http://exemple.com/${name}`;
  const httpsRoot = 'https://exemple.com/';

  it('flags a page linking internal http URLs, with sorted targets', () => {
    const result = runCheck(
      pageChecks,
      31,
      crawlOf(
        [makePage(httpsRoot), makePage(u('a'))],
        [
          makeLink(u('a'), httpUrl('z')),
          makeLink(u('a'), httpUrl('m')),
          makeLink(u('a'), u('ok')),
          makeLink(httpsRoot, u('a')),
        ],
      ),
    );
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.occurrences[0]?.info).toEqual({ targets: [httpUrl('m'), httpUrl('z')] });
    expect(result.examined).toBe(2);
  });

  it('still flags an http link whose target redirects to https', () => {
    const result = runCheck(
      pageChecks,
      31,
      crawlOf(
        [
          makePage(httpsRoot),
          makePage(httpUrl('a'), { status: 301, redirectTarget: u('a') }),
          makePage(u('a')),
        ],
        [makeLink(httpsRoot, httpUrl('a'))],
      ),
    );
    expect(flaggedUrls(result)).toEqual([httpsRoot]);
  });

  it('flags nothing and examines nothing when the final root is http', () => {
    const root = httpUrl('');
    const crawl = { ...crawlOf([makePage(root)], [makeLink(root, httpUrl('a'))]), rootUrl: root };
    const result = runCheck(pageChecks, 31, crawl);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });

  it('does not flag an external http link', () => {
    const result = runCheck(
      pageChecks,
      31,
      crawlOf(
        [makePage(httpsRoot)],
        [makeLink(httpsRoot, 'http://autre.fr/a', { type: 'external' })],
      ),
    );
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 129 (uncompressed pages)', () => {
  const withEncoding = (name: string, encoding?: string): Page =>
    makePage(u(name), { headers: encoding === undefined ? {} : { 'content-encoding': encoding } });

  it('flags an HTML 200 page without content-encoding', () => {
    const result = runCheck(pageChecks, 129, crawlOf([withEncoding('a')]));
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.examined).toBe(1);
  });

  it.each(['gzip', 'br', 'zstd', 'deflate', 'gzip, identity', 'GZIP'])(
    'does not flag content-encoding %s',
    (encoding) => {
      const result = runCheck(pageChecks, 129, crawlOf([withEncoding('a', encoding)]));
      expect(flaggedUrls(result)).toEqual([]);
      expect(result.examined).toBe(1);
    },
  );

  it('flags content-encoding identity', () => {
    const result = runCheck(pageChecks, 129, crawlOf([withEncoding('a', 'identity')]));
    expect(flaggedUrls(result)).toEqual([u('a')]);
  });

  it('does not examine non-HTML pages or error pages', () => {
    const result = runCheck(
      pageChecks,
      129,
      crawlOf([
        makePage(u('img'), { isHtml: false, contentType: 'image/png' }),
        makePage(u('gone'), { status: 404 }),
      ]),
    );
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 111 (slow response)', () => {
  const timed = (name: string, responseTimeMs: number, overrides: Partial<Page> = {}): Page =>
    makePage(u(name), { responseTimeMs, ...overrides });

  it('flags an HTML 200 page slower than 3000 ms with its response time', () => {
    const result = runCheck(pageChecks, 111, crawlOf([timed('slow', 3001)]));
    expect(flaggedUrls(result)).toEqual([u('slow')]);
    expect(result.occurrences[0]?.info).toEqual({ responseTimeMs: 3001 });
    expect(result.examined).toBe(1);
  });

  it('does not flag a page at exactly 3000 ms', () => {
    const result = runCheck(pageChecks, 111, crawlOf([timed('edge', 3000)]));
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(1);
  });

  it('does not examine 404 or non-HTML pages', () => {
    const result = runCheck(
      pageChecks,
      111,
      crawlOf([
        timed('gone', 5000, { status: 404 }),
        timed('img', 5000, { isHtml: false, contentType: 'image/png' }),
      ]),
    );
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('checks 20 and 46 (viewport)', () => {
  const withViewport = (name: string, viewport: string | null, overrides: Partial<Page> = {}) =>
    makePage(u(name), { htmlFacts: { viewport }, ...overrides });

  it('flags a page without viewport with 20 only', () => {
    const pages = [withViewport('a', null)];
    expect(flaggedUrls(run(20, pages))).toEqual([u('a')]);
    expect(flaggedUrls(run(46, pages))).toEqual([]);
  });

  it.each(['initial-scale=1', '', 'minimum-scale=1, user-scalable=no'])(
    'flags the viewport "%s" without width with 46 only',
    (viewport) => {
      const pages = [withViewport('a', viewport)];
      expect(flaggedUrls(run(46, pages))).toEqual([u('a')]);
      expect(flaggedUrls(run(20, pages))).toEqual([]);
    },
  );

  it.each(['width=device-width, initial-scale=1', 'initial-scale=1,WIDTH = 980', 'width=500'])(
    'flags nothing for the viewport "%s"',
    (viewport) => {
      const pages = [withViewport('a', viewport)];
      expect(flaggedUrls(run(20, pages))).toEqual([]);
      expect(flaggedUrls(run(46, pages))).toEqual([]);
      expect(run(20, pages).examined).toBe(1);
      expect(run(46, pages).examined).toBe(1);
    },
  );

  it('does not read a width-like token as a width', () => {
    expect(flaggedUrls(run(46, [withViewport('a', 'min-width=300')]))).toEqual([u('a')]);
  });

  it('does not examine error pages, non-HTML pages or pages without facts', () => {
    const pages = [
      withViewport('gone', null, { status: 404 }),
      withViewport('img', null, { isHtml: false }),
      makePage(u('old'), { htmlFacts: null }),
    ];
    for (const id of [20, 46]) {
      const result = run(id, pages);
      expect(flaggedUrls(result)).toEqual([]);
      expect(result.examined).toBe(0);
    }
  });
});

describe('check 115 (encoding not declared)', () => {
  const withCharset = (
    name: string,
    charset: string | null,
    contentType: string | null,
    overrides: Partial<Page> = {},
  ) => makePage(u(name), { htmlFacts: { charset }, contentType, ...overrides });

  it('flags a page with neither a meta charset nor a header charset', () => {
    const result = run(115, [withCharset('a', null, 'text/html')]);
    expect(flaggedUrls(result)).toEqual([u('a')]);
    expect(result.examined).toBe(1);
  });

  it('flags a page without Content-Type header and without meta charset', () => {
    expect(flaggedUrls(run(115, [withCharset('a', null, null)]))).toEqual([u('a')]);
  });

  it.each([
    ['text/html; charset=utf-8', null],
    ['text/html; Charset = "ISO-8859-1"', null],
    ['text/html', 'utf-8'],
  ])('does not flag the Content-Type "%s" with meta charset %s', (contentType, charset) => {
    expect(flaggedUrls(run(115, [withCharset('a', charset, contentType)]))).toEqual([]);
  });

  it('does not examine error pages, non-HTML pages or pages without facts', () => {
    const result = run(115, [
      withCharset('gone', null, 'text/html', { status: 404 }),
      withCharset('img', null, 'image/png', { isHtml: false }),
      makePage(u('old'), { htmlFacts: null, contentType: 'text/html' }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 116 (doctype not declared)', () => {
  const withDoctype = (name: string, hasDoctype: boolean, overrides: Partial<Page> = {}) =>
    makePage(u(name), { htmlFacts: { hasDoctype }, ...overrides });

  it('flags a page without doctype and not one with a doctype', () => {
    const result = run(116, [withDoctype('bare', false), withDoctype('ok', true)]);
    expect(flaggedUrls(result)).toEqual([u('bare')]);
    expect(result.examined).toBe(2);
  });

  it('does not examine error pages, non-HTML pages or pages without facts', () => {
    const result = run(116, [
      withDoctype('gone', false, { status: 404 }),
      withDoctype('img', false, { isHtml: false }),
      makePage(u('old'), { htmlFacts: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 110 (images without alt)', () => {
  const withImages = (
    name: string,
    total: number,
    examples: string[],
    overrides: Partial<Page> = {},
  ) => makePage(u(name), { htmlFacts: { imagesWithoutAlt: { total, examples } }, ...overrides });

  it('flags a page with 2 images without alt, with the total and the examples', () => {
    const result = run(110, [withImages('bad', 2, ['/a.png', '/b.png']), withImages('ok', 0, [])]);
    expect(flaggedUrls(result)).toEqual([u('bad')]);
    expect(result.occurrences[0]?.info).toEqual({ total: 2, examples: ['/a.png', '/b.png'] });
    expect(result.examined).toBe(2);
  });

  it('keeps the real total when the examples are capped (50 images)', () => {
    const examples = Array.from({ length: 20 }, (_, i) => `/i${String(i)}.png`);
    const result = run(110, [withImages('many', 50, examples)]);
    expect(result.occurrences[0]?.info).toEqual({ total: 50, examples });
  });

  it('does not examine error pages, non-HTML pages or pages without facts', () => {
    const result = run(110, [
      withImages('gone', 3, ['/a.png'], { status: 404 }),
      withImages('img', 3, ['/a.png'], { isHtml: false }),
      makePage(u('old'), { htmlFacts: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 121 (frames)', () => {
  const withFrames = (name: string, hasFrames: boolean, overrides: Partial<Page> = {}) =>
    makePage(u(name), { htmlFacts: { hasFrames }, ...overrides });

  it('flags a page built with frames and not one without', () => {
    const result = run(121, [withFrames('framed', true), withFrames('plain', false)]);
    expect(flaggedUrls(result)).toEqual([u('framed')]);
    expect(result.examined).toBe(2);
  });

  it('does not examine error pages, non-HTML pages or pages without facts', () => {
    const result = run(121, [
      withFrames('gone', true, { status: 404 }),
      withFrames('img', true, { isHtml: false }),
      makePage(u('old'), { htmlFacts: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 220 (too much content)', () => {
  it('flags 10001 words but not 10000, with the word count', () => {
    const result = run(220, [
      makePage(u('long'), { wordCount: 10_001 }),
      makePage(u('limit'), { wordCount: 10_000 }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('long')]);
    expect(result.occurrences[0]?.info).toEqual({ words: 10_001 });
    expect(result.examined).toBe(2);
  });

  it('does not examine error pages, non-HTML pages or unknown word counts', () => {
    const result = run(220, [
      makePage(u('gone'), { status: 404, wordCount: 20_000 }),
      makePage(u('img'), { isHtml: false, wordCount: 20_000 }),
      makePage(u('old'), { wordCount: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 21 (large HTML page)', () => {
  const withBytes = (name: string, htmlBytes: number, overrides: Partial<Page> = {}) =>
    makePage(u(name), { htmlFacts: { htmlBytes }, ...overrides });

  it('flags 2097153 bytes but not 2097152, with the byte size', () => {
    const result = run(21, [withBytes('big', 2_097_153), withBytes('limit', 2_097_152)]);
    expect(flaggedUrls(result)).toEqual([u('big')]);
    expect(result.occurrences[0]?.info).toEqual({ bytes: 2_097_153 });
    expect(result.examined).toBe(2);
  });

  it('does not examine error pages, non-HTML pages or pages without facts', () => {
    const result = run(21, [
      withBytes('gone', 3_000_000, { status: 404 }),
      withBytes('img', 3_000_000, { isHtml: false }),
      makePage(u('old'), { htmlFacts: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 39 (multiple canonicals)', () => {
  const withCanonicals = (name: string, urls: string[], overrides: Partial<Page> = {}) =>
    makePage(u(name), {
      htmlFacts: { canonicalCount: urls.length, canonicalUrls: urls },
      ...overrides,
    });

  it('flags two canonicals, even identical, with their URLs', () => {
    const result = run(39, [
      withCanonicals('same', [u('a'), u('a')]),
      withCanonicals('diff', [u('a'), u('b')]),
    ]);
    expect(flaggedUrls(result)).toEqual([u('same'), u('diff')]);
    expect(result.occurrences[1]?.info).toEqual({ urls: [u('a'), u('b')] });
    expect(result.examined).toBe(2);
  });

  it('does not flag one canonical or none', () => {
    const result = run(39, [withCanonicals('one', [u('a')]), withCanonicals('none', [])]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(2);
  });

  it('does not examine error pages, non-HTML pages or pages without facts', () => {
    const result = run(39, [
      withCanonicals('gone', [u('a'), u('b')], { status: 404 }),
      withCanonicals('img', [u('a'), u('b')], { isHtml: false }),
      makePage(u('old'), { htmlFacts: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 40 (meta refresh)', () => {
  const withRefresh = (
    name: string,
    metaRefresh: { delaySeconds: number; target: string | null } | null,
    overrides: Partial<Page> = {},
  ) => makePage(u(name), { htmlFacts: { metaRefresh }, ...overrides });

  it('flags a refresh with a target, with its delay and target', () => {
    const result = run(40, [
      withRefresh('jump', { delaySeconds: 5, target: u('next') }),
      withRefresh('none', null),
    ]);
    expect(flaggedUrls(result)).toEqual([u('jump')]);
    expect(result.occurrences[0]?.info).toEqual({ delaySeconds: 5, target: u('next') });
    expect(result.examined).toBe(2);
  });

  it('does not flag a plain reload without a target', () => {
    const result = run(40, [withRefresh('reload', { delaySeconds: 30, target: null })]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(1);
  });

  it('does not examine error pages, non-HTML pages or pages without facts', () => {
    const refresh = { delaySeconds: 0, target: u('x') };
    const result = run(40, [
      withRefresh('gone', refresh, { status: 404 }),
      withRefresh('img', refresh, { isHtml: false }),
      makePage(u('old'), { htmlFacts: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 44 (malformed links)', () => {
  const withMalformed = (
    name: string,
    total: number,
    examples: string[],
    overrides: Partial<Page> = {},
  ) => makePage(u(name), { htmlFacts: { malformedLinks: { total, examples } }, ...overrides });

  it('flags a page with 3 malformed hrefs, with the total and the raw hrefs', () => {
    const hrefs = ['http:/x', 'htp://y', 'https//z'];
    const result = run(44, [withMalformed('bad', 3, hrefs), withMalformed('ok', 0, [])]);
    expect(flaggedUrls(result)).toEqual([u('bad')]);
    expect(result.occurrences[0]?.info).toEqual({ total: 3, examples: hrefs });
    expect(result.examined).toBe(2);
  });

  it('keeps the real total when the examples are capped', () => {
    const examples = Array.from({ length: 20 }, (_, i) => `http:/${String(i)}`);
    const result = run(44, [withMalformed('many', 35, examples)]);
    expect(result.occurrences[0]?.info).toEqual({ total: 35, examples });
  });

  it('does not examine error pages, non-HTML pages or pages without facts', () => {
    const result = run(44, [
      withMalformed('gone', 3, ['http:/x'], { status: 404 }),
      withMalformed('img', 3, ['http:/x'], { isHtml: false }),
      makePage(u('old'), { htmlFacts: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 30 (mixed content)', () => {
  const withInsecure = (
    url: string,
    total: number,
    examples: string[],
    overrides: Partial<Page> = {},
  ) => makePage(url, { htmlFacts: { insecureResources: { total, examples } }, ...overrides });

  it('flags an https page loading an http image, with the total and the URLs', () => {
    const urls = ['http://cdn.exemple.com/a.png', 'http://cdn.exemple.com/b.js'];
    const result = run(30, [withInsecure(u('mixed'), 2, urls), withInsecure(u('clean'), 0, [])]);
    expect(flaggedUrls(result)).toEqual([u('mixed')]);
    expect(result.occurrences[0]?.info).toEqual({ total: 2, urls });
    expect(result.examined).toBe(2);
  });

  it('keeps the real total when the URLs are capped', () => {
    const urls = Array.from({ length: 20 }, (_, i) => `http://cdn.exemple.com/${String(i)}.png`);
    const result = run(30, [withInsecure(u('many'), 31, urls)]);
    expect(result.occurrences[0]?.info).toEqual({ total: 31, urls });
  });

  it('does not examine http pages, error pages, non-HTML pages or pages without facts', () => {
    const insecure = ['http://cdn.exemple.com/a.png'];
    const result = run(30, [
      withInsecure('http://exemple.com/plain', 1, insecure),
      withInsecure(u('gone'), 1, insecure, { status: 404 }),
      withInsecure(u('img'), 1, insecure, { isHtml: false }),
      makePage(u('old'), { htmlFacts: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 114 (language not declared)', () => {
  const withLanguage = (
    name: string,
    lang: string | null,
    hreflang: { lang: string; url: string }[],
    overrides: Partial<Page> = {},
  ) => makePage(u(name), { htmlFacts: { lang, hreflang }, ...overrides });

  it('flags a page with neither lang nor hreflang, but not with one of them', () => {
    const result = run(114, [
      withLanguage('none', null, []),
      withLanguage('lang', 'fr', []),
      withLanguage('alternate', null, [{ lang: 'fr', url: u('fr') }]),
    ]);
    expect(flaggedUrls(result)).toEqual([u('none')]);
    expect(result.examined).toBe(3);
  });

  it('does not examine error pages, non-HTML pages or pages without facts', () => {
    const result = run(114, [
      withLanguage('gone', null, [], { status: 404 }),
      withLanguage('img', null, [], { isHtml: false }),
      makePage(u('old'), { htmlFacts: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 23 (invalid hreflang values)', () => {
  const withHreflang = (name: string, values: string[], overrides: Partial<Page> = {}) =>
    makePage(u(name), {
      htmlFacts: { lang: 'en', hreflang: values.map((lang) => ({ lang, url: u('alt') })) },
      ...overrides,
    });

  it('accepts valid codes whatever their case', () => {
    const result = run(23, [
      withHreflang('ok', ['en-GB', 'fr', 'zh-Hant-TW', 'X-Default', 'EN-gb']),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(1);
  });

  it('flags a page with invalid codes and lists them', () => {
    const result = run(23, [
      withHreflang('bad', ['en-UK', 'fr', 'english', 'fr_FR']),
      withHreflang('good', ['fr']),
    ]);
    expect(flaggedUrls(result)).toEqual([u('bad')]);
    expect(result.occurrences[0]?.info).toEqual({ invalid: ['en-UK', 'english', 'fr_FR'] });
    expect(result.examined).toBe(2);
  });

  it('only examines HTML 2xx pages with hreflang facts', () => {
    const result = run(23, [
      withHreflang('gone', ['xx'], { status: 404 }),
      withHreflang('none', []),
      makePage(u('old'), { htmlFacts: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 24 (hreflang conflicts)', () => {
  const alternates = (name: string, entries: [string, string][], overrides: Partial<Page> = {}) =>
    makePage(u(name), {
      htmlFacts: { lang: 'en', hreflang: entries.map(([lang, url]) => ({ lang, url })) },
      ...overrides,
    });

  it('flags one language pointing to two different URLs, case ignored', () => {
    const result = run(24, [
      alternates('p', [
        ['en', u('p')],
        ['EN', u('other')],
        ['fr', u('fr')],
      ]),
    ]);
    expect(flaggedUrls(result)).toEqual([u('p')]);
    expect(result.occurrences[0]?.info).toEqual({
      reasons: ['conflict'],
      conflicts: [{ lang: 'en', urls: [u('p'), u('other')] }],
    });
  });

  it('does not flag the same URL repeated, even with a fragment', () => {
    const result = run(24, [
      alternates('p', [
        ['en', u('p')],
        ['en', `${u('p')}#top`],
      ]),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
  });

  it('flags alternates that never point to the page or its canonical', () => {
    const result = run(24, [alternates('p', [['fr', u('fr')]])]);
    expect(result.occurrences[0]?.info).toEqual({ reasons: ['missing-self-reference'] });
  });

  it('accepts a self-reference through the canonical', () => {
    const result = run(24, [alternates('p', [['fr', u('c')]], { canonical: u('c') })]);
    expect(flaggedUrls(result)).toEqual([]);
  });

  it('does not flag a coherent set with a self-reference', () => {
    const result = run(24, [
      alternates('p', [
        ['en', u('p')],
        ['fr', u('fr')],
      ]),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(1);
  });

  it('only examines HTML 2xx pages with hreflang facts', () => {
    const result = run(24, [
      alternates('gone', [['fr', u('fr')]], { status: 404 }),
      alternates('none', []),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 25 (hreflang to an error or redirected page)', () => {
  const withHreflang = (name: string, entries: [string, string][]): Page =>
    makePage(u(name), {
      htmlFacts: { lang: 'en', hreflang: entries.map(([lang, url]) => ({ lang, url })) },
    });

  it('flags a hreflang to a crawled 404 or redirected page with the target and its status', () => {
    const result = run(25, [
      withHreflang('p', [
        ['fr', u('gone')],
        ['de', `${u('moved')}#top`],
      ]),
      makePage(u('gone'), { status: 404, isHtml: false }),
      makePage(u('moved'), { status: 301, isHtml: false }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('p')]);
    expect(result.occurrences[0]?.info).toEqual({
      targets: [
        { lang: 'fr', url: u('gone'), status: 404 },
        { lang: 'de', url: `${u('moved')}#top`, status: 301 },
      ],
    });
    expect(result.examined).toBe(1);
  });

  it('flags a hreflang to a 5xx page or to a network failure', () => {
    const result = run(25, [
      withHreflang('a', [['fr', u('down')]]),
      withHreflang('b', [['fr', u('net')]]),
      makePage(u('down'), { status: 503, isHtml: false }),
      makePage(u('net'), { status: null, error: 'timeout', isHtml: false }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('a'), u('b')]);
    expect(result.occurrences[1]?.info).toEqual({
      targets: [{ lang: 'fr', url: u('net'), status: null }],
    });
  });

  it('ignores uncrawled targets, healthy targets and pages without judgeable hreflang', () => {
    const result = run(25, [
      withHreflang('ok', [['fr', u('fine')]]),
      withHreflang('unknown', [['fr', u('never-crawled')]]),
      makePage(u('none')),
      makePage(u('old'), { htmlFacts: null }),
      makePage(u('fine')),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(2);
  });
});

describe('check 204 (hreflang language differs from the target language)', () => {
  const withHreflang = (name: string, entries: [string, string][]): Page =>
    makePage(u(name), {
      htmlFacts: { lang: 'en', hreflang: entries.map(([lang, url]) => ({ lang, url })) },
    });
  const speaking = (name: string, lang: string | undefined, overrides: Partial<Page> = {}): Page =>
    makePage(u(name), {
      htmlFacts: lang === undefined ? { hreflang: [] } : { lang, hreflang: [] },
      ...overrides,
    });

  it('flags hreflang=de pointing to a crawled page declared in French', () => {
    const result = run(204, [withHreflang('p', [['de', u('fr')]]), speaking('fr', 'fr')]);
    expect(flaggedUrls(result)).toEqual([u('p')]);
    expect(result.occurrences[0]?.info).toEqual({
      targets: [{ lang: 'de', url: u('fr'), targetLang: 'fr' }],
    });
    expect(result.examined).toBe(1);
  });

  it('compares the primary language only, case ignored', () => {
    const result = run(204, [
      withHreflang('p', [
        ['fr', u('a')],
        ['FR-ca', u('b')],
        ['fr-FR', u('c')],
      ]),
      speaking('a', 'fr-FR'),
      speaking('b', 'FR'),
      speaking('c', 'fr_CA'),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
  });

  it('ignores x-default, uncrawled targets and targets whose language cannot be read', () => {
    const result = run(204, [
      withHreflang('p', [
        ['x-default', u('fr')],
        ['de', u('never-crawled')],
        ['de', u('no-lang')],
        ['de', u('blank')],
        ['de', u('gone')],
        ['de', u('plain')],
      ]),
      speaking('fr', 'fr'),
      speaking('no-lang', undefined),
      speaking('blank', ''),
      speaking('gone', 'fr', { status: 404 }),
      makePage(u('plain'), { htmlFacts: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
  });
});

describe('check 45 (invalid structured data)', () => {
  const withJsonLd = (
    name: string,
    jsonLd: { count: number; invalid: number; invalidReasons: string[] },
    overrides: Partial<Page> = {},
  ) => makePage(u(name), { htmlFacts: { jsonLd: { types: [], ...jsonLd } }, ...overrides });

  it('flags a page with invalid JSON-LD blocks, with their count and reasons', () => {
    const result = run(45, [
      withJsonLd('none', { count: 0, invalid: 0, invalidReasons: [] }),
      withJsonLd('valid', { count: 2, invalid: 0, invalidReasons: [] }),
      withJsonLd('broken', {
        count: 3,
        invalid: 2,
        invalidReasons: ['unparseable', 'missing-type'],
      }),
    ]);
    expect(flaggedUrls(result)).toEqual([u('broken')]);
    expect(result.occurrences[0]?.info).toEqual({
      invalid: 2,
      reasons: ['unparseable', 'missing-type'],
    });
    expect(result.examined).toBe(3);
  });

  it('does not examine error pages, non-HTML pages or pages without facts', () => {
    const broken = { count: 1, invalid: 1, invalidReasons: ['missing-context'] };
    const result = run(45, [
      withJsonLd('gone', broken, { status: 404 }),
      withJsonLd('img', broken, { isHtml: false }),
      makePage(u('old'), { htmlFacts: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 222 (no semantic HTML elements)', () => {
  const withSemantics = (name: string, semanticElements: string[], overrides: Partial<Page> = {}) =>
    makePage(u(name), { htmlFacts: { semanticElements }, ...overrides });

  it('flags a page with no semantic element, but not with a single footer', () => {
    const result = run(222, [
      withSemantics('div-soup', []),
      withSemantics('footer-only', ['footer']),
    ]);
    expect(flaggedUrls(result)).toEqual([u('div-soup')]);
    expect(result.examined).toBe(2);
  });

  it('does not examine error pages, non-HTML pages or pages without facts', () => {
    const result = run(222, [
      withSemantics('gone', [], { status: 404 }),
      withSemantics('img', [], { isHtml: false }),
      makePage(u('old'), { htmlFacts: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([]);
    expect(result.examined).toBe(0);
  });
});

describe('check 18 (sitemap URL in error or redirected)', () => {
  const inSitemap = (name: string, overrides: Partial<Page> = {}): Page =>
    makePage(name, { inSitemap: true, ...overrides });

  it('flags sitemap pages in 4xx, 5xx, redirected or failing, with their status', () => {
    const result = run(18, [
      inSitemap(u('nf'), { status: 404 }),
      inSitemap(u('down'), { status: 500 }),
      inSitemap(u('moved'), { status: 301, redirectTarget: u('target') }),
      inSitemap(u('net'), { status: null, isHtml: false, error: 'ECONNRESET' }),
      inSitemap(u('ok')),
    ]);
    expect(flaggedUrls(result)).toEqual([u('nf'), u('down'), u('moved'), u('net')]);
    expect(result.occurrences.map((occurrence) => occurrence.info)).toEqual([
      { status: 404, error: null },
      { status: 500, error: null },
      { status: 301, error: null },
      { status: null, error: 'ECONNRESET' },
    ]);
    expect(result.examined).toBe(5);
  });

  it('does not examine pages absent from the sitemap or when no sitemap was read', () => {
    const result = run(18, [
      makePage(u('a'), { status: 404, inSitemap: false }),
      makePage(u('b'), { status: 404, inSitemap: null }),
    ]);
    expect(result.count).toBe(0);
    expect(result.examined).toBe(0);
  });
});

describe('check 128 (http sitemap URL on an https site)', () => {
  const httpUrl = (name: string): string => `http://exemple.com/${name}`;
  const httpsRoot = 'https://exemple.com/';

  it('flags sitemap pages listed over http when the site is https', () => {
    const result = run(128, [
      makePage(httpsRoot, { inSitemap: true }),
      makePage(httpUrl('a'), { inSitemap: true, status: 301 }),
      makePage(httpUrl('b'), { inSitemap: false }),
      makePage(httpUrl('c'), { inSitemap: null }),
    ]);
    expect(flaggedUrls(result)).toEqual([httpUrl('a')]);
    expect(result.examined).toBe(2);
  });

  it('flags nothing on an http site', () => {
    const crawl = crawlOf([
      makePage(httpUrl('root'), { inSitemap: true }),
      makePage(httpUrl('a'), { inSitemap: true }),
    ]);
    const result = runCheck(pageChecks, 128, { ...crawl, rootUrl: httpUrl('root') });
    expect(result.count).toBe(0);
    expect(result.examined).toBe(0);
  });
});

describe('check 207 (sitemap page that no other page links to)', () => {
  const listed = (name: string, overrides: Partial<Page> = {}): Page =>
    makePage(u(name), { inSitemap: true, ...overrides });

  it('flags a sitemap page with no incoming internal link', () => {
    const result = run(207, [listed('orphan'), listed('home')]);
    expect(flaggedUrls(result)).toEqual([u('orphan'), u('home')]);
    expect(result.examined).toBe(2);
  });

  it('flags a page that only links to itself', () => {
    const result = runCheck(
      pageChecks,
      207,
      crawlOf([listed('self')], [makeLink(u('self'), u('self'))]),
    );
    expect(flaggedUrls(result)).toEqual([u('self')]);
  });

  it('does not flag a sitemap page linked from another page', () => {
    const result = runCheck(
      pageChecks,
      207,
      crawlOf([listed('a'), listed('b')], [makeLink(u('a'), u('b')), makeLink(u('b'), u('a'))]),
    );
    expect(result.count).toBe(0);
  });

  it('counts a link that reaches the page through a redirect', () => {
    const pages = [
      listed('a'),
      listed('new'),
      makePage(u('old'), { status: 301, isHtml: false, redirectTarget: u('new') }),
    ];
    const links = [makeLink(u('a'), u('old')), makeLink(u('new'), u('a'))];
    const result = runCheck(pageChecks, 207, crawlOf(pages, links));
    expect(result.count).toBe(0);
  });

  it('ignores external and resource links as incoming links', () => {
    const links = [
      makeLink(u('a'), u('b'), { type: 'resource' }),
      makeLink(u('a'), u('b'), { type: 'external' }),
    ];
    const result = runCheck(pageChecks, 207, crawlOf([listed('a'), listed('b')], links));
    expect(flaggedUrls(result)).toEqual([u('a'), u('b')]);
  });

  it('only examines HTML 2xx pages listed in the sitemap', () => {
    const result = run(207, [
      makePage(u('not-listed'), { inSitemap: false }),
      makePage(u('unknown'), { inSitemap: null }),
      listed('gone', { status: 404 }),
      listed('pdf', { isHtml: false }),
    ]);
    expect(result.count).toBe(0);
    expect(result.examined).toBe(0);
  });
});
