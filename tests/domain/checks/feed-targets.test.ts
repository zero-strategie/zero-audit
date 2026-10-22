import { describe, expect, it } from 'vitest';
import { declaredFeedUrls, isFeedTarget } from '../../../src/domain/checks/page/feed-targets.js';
import { makePage, u } from '../../support/check-fixtures.js';

describe('declaredFeedUrls', () => {
  it('collects the declared feeds of every page', () => {
    const pages = [
      makePage(u('a'), { htmlFacts: { declaredFeeds: [u('x.xml')] } }),
      makePage(u('b'), { htmlFacts: { declaredFeeds: [u('y.xml')] } }),
    ];
    expect([...declaredFeedUrls(pages)].sort()).toEqual([u('x.xml'), u('y.xml')]);
  });

  it('ignores pages without declaredFeeds, a non-array value and non-string entries', () => {
    const pages = [
      makePage(u('a')),
      makePage(u('b'), { htmlFacts: { declaredFeeds: 'nope' } }),
      makePage(u('c'), { htmlFacts: { declaredFeeds: [42, null, u('ok.xml')] } }),
    ];
    expect([...declaredFeedUrls(pages)]).toEqual([u('ok.xml')]);
  });
});

describe('isFeedTarget', () => {
  const none: ReadonlySet<string> = new Set();

  it('recognises application/feed+json', () => {
    const page = makePage(u('data/f'), { contentType: 'application/feed+json' });
    expect(isFeedTarget(u('data/f'), page, none)).toBe(true);
  });

  it('does not recognise a generic xml file', () => {
    const page = makePage(u('data/export.xml'), { contentType: 'application/xml' });
    expect(isFeedTarget(u('data/export.xml'), page, none)).toBe(false);
  });

  it('works without a crawled page', () => {
    expect(isFeedTarget(u('data/export.xml'), undefined, none)).toBe(false);
    expect(isFeedTarget(u('feed.xml'), undefined, none)).toBe(true);
  });
});
