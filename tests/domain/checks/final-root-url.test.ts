import { describe, expect, it } from 'vitest';
import { finalRootUrl } from '../../../src/domain/checks/final-root-url.js';
import { crawlOf, makePage, u } from '../../support/check-fixtures.js';

const ROOT = 'https://exemple.com/';

describe('finalRootUrl', () => {
  it('returns the root itself when it does not redirect', () => {
    expect(finalRootUrl(crawlOf([makePage(ROOT)]))).toBe(ROOT);
  });

  it('follows the redirect chain of the root to its end', () => {
    const crawl = crawlOf([
      makePage(ROOT, { status: 301, isHtml: false, redirectTarget: u('a') }),
      makePage(u('a'), { status: 302, isHtml: false, redirectTarget: u('b') }),
      makePage(u('b')),
    ]);
    expect(finalRootUrl(crawl)).toBe(u('b'));
  });

  it('returns the root itself when it failed without any redirect', () => {
    const crawl = crawlOf([makePage(ROOT, { status: null, error: 'ECONNRESET', isHtml: false })]);
    expect(finalRootUrl(crawl)).toBe(ROOT);
  });

  it('returns the root itself when the crawl has no page', () => {
    expect(finalRootUrl(crawlOf([]))).toBe(ROOT);
  });
});
