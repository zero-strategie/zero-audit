import { describe, expect, it } from 'vitest';
import type { CheckResult } from '../../../src/domain/check.js';
import type { Link, Page } from '../../../src/domain/crawl.js';
import { siteChecks } from '../../../src/domain/checks/site/index.js';
import {
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
