import { describe, expect, it } from 'vitest';
import type { CheckResult } from '../../../src/domain/check.js';
import type { Page } from '../../../src/domain/crawl.js';
import { pageChecks } from '../../../src/domain/checks/page/index.js';
import {
  crawlOf,
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
    const result = run(105, [
      makePage(u('a'), { title: 'Zero', h1: ['Autre', 'zero', ' ZERO '] }),
    ]);
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

describe('non-HTML resources', () => {
  it('are counted by no content check', () => {
    const image = makePage(u('logo.png'), {
      contentType: 'image/png',
      isHtml: false,
      title: null,
      h1: [],
      metaDescription: null,
      wordCount: null,
    });
    for (const id of [3, 101, 102, 103, 104, 106, 117]) {
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
      101: 'warning',
      102: 'warning',
      103: 'warning',
      106: 'warning',
      117: 'warning',
      104: 'notice',
      105: 'warning',
    });
  });

  it('never copies a catalogue title', () => {
    expectNoCatalogueTitleCopied(pageChecks);
  });
});
