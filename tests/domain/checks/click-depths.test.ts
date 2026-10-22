import { describe, expect, it } from 'vitest';
import { clickDepths } from '../../../src/domain/checks/click-depths.js';
import { crawlOf, makeLink, makePage, u } from '../../support/check-fixtures.js';
import type { Link, Page } from '../../../src/domain/crawl.js';

const ROOT = 'https://exemple.com/';

const depthsOf = (pages: Page[], links: Link[]): Record<string, number> =>
  Object.fromEntries(clickDepths(crawlOf(pages, links)));

describe('clickDepths', () => {
  it('counts one click per internal link followed from the root', () => {
    const pages = [ROOT, u('a'), u('b')].map((url) => makePage(url));
    const links = [makeLink(ROOT, u('a')), makeLink(u('a'), u('b'))];
    expect(depthsOf(pages, links)).toEqual({ [ROOT]: 0, [u('a')]: 1, [u('b')]: 2 });
  });

  it('keeps the shortest path and survives cycles', () => {
    const pages = [ROOT, u('a'), u('b')].map((url) => makePage(url));
    const links = [
      makeLink(ROOT, u('a')),
      makeLink(u('a'), u('b')),
      makeLink(ROOT, u('b')),
      makeLink(u('b'), ROOT),
    ];
    expect(depthsOf(pages, links)).toEqual({ [ROOT]: 0, [u('a')]: 1, [u('b')]: 1 });
  });

  it('leaves out pages that no link leads to', () => {
    const pages = [ROOT, u('lonely')].map((url) => makePage(url));
    expect(depthsOf(pages, [])).toEqual({ [ROOT]: 0 });
  });

  it('ignores external and resource links', () => {
    const pages = [ROOT, u('a'), u('b')].map((url) => makePage(url));
    const links = [
      makeLink(ROOT, u('a'), { type: 'external' }),
      makeLink(ROOT, u('b'), { type: 'resource' }),
    ];
    expect(depthsOf(pages, links)).toEqual({ [ROOT]: 0 });
  });

  it('starts from the final root and does not count the root redirect as a click', () => {
    const start = 'http://exemple.com/';
    const pages = [
      makePage(start, { status: 301, isHtml: false, redirectTarget: ROOT }),
      makePage(ROOT),
      makePage(u('a')),
    ];
    const links = [makeLink(ROOT, u('a'))];
    expect(Object.fromEntries(clickDepths({ ...crawlOf(pages, links), rootUrl: start }))).toEqual({
      [ROOT]: 0,
      [u('a')]: 1,
    });
  });

  it('lands on the destination of a redirecting link without counting the redirect', () => {
    const pages = [
      makePage(ROOT),
      makePage(u('old'), { status: 301, isHtml: false, redirectTarget: u('new') }),
      makePage(u('new')),
    ];
    expect(depthsOf(pages, [makeLink(ROOT, u('old'))])).toEqual({ [ROOT]: 0, [u('new')]: 1 });
  });

  it('normalizes link targets before matching pages', () => {
    const pages = [makePage(ROOT), makePage(u('a'))];
    expect(depthsOf(pages, [makeLink(ROOT, `${u('a')}#top`)])).toEqual({ [ROOT]: 0, [u('a')]: 1 });
  });
});
