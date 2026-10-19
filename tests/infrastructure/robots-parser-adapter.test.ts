import { describe, expect, it } from 'vitest';
import { RobotsParserAdapter } from '../../src/infrastructure/robots-parser-adapter.js';

const ROBOTS_URL = 'https://example.test/robots.txt';
const policyFor = (content: string) => new RobotsParserAdapter().fromRobotsTxt(ROBOTS_URL, content);

describe('RobotsParserAdapter', () => {
  it('applies the wildcard group when no group targets the bot', () => {
    const policy = policyFor('User-agent: *\nDisallow: /private');

    expect(policy.isAllowed('https://example.test/private/x')).toBe(false);
    expect(policy.isAllowed('https://example.test/public')).toBe(true);
  });

  it('prefers the ZeroAuditBot group over the wildcard group', () => {
    const policy = policyFor(
      'User-agent: ZeroAuditBot\nDisallow: /a\n\nUser-agent: *\nDisallow: /b',
    );

    expect(policy.isAllowed('https://example.test/a')).toBe(false);
    expect(policy.isAllowed('https://example.test/b')).toBe(true);
  });

  it('exposes the crawl delay of the applicable group in milliseconds', () => {
    const policy = policyFor('User-agent: *\nCrawl-delay: 2');

    expect(policy.crawlDelayMs).toBe(2000);
  });

  it('exposes no crawl delay when none is declared', () => {
    expect(policyFor('User-agent: *\nDisallow:').crawlDelayMs).toBeNull();
  });

  it('lists the declared sitemaps', () => {
    const policy = policyFor(
      'User-agent: *\nDisallow:\nSitemap: https://example.test/a.xml\nSitemap: https://example.test/b.xml',
    );

    expect(policy.sitemapUrls).toEqual([
      'https://example.test/a.xml',
      'https://example.test/b.xml',
    ]);
  });

  it('allows everything with allowAll', () => {
    const policy = new RobotsParserAdapter().allowAll();

    expect(policy.isAllowed('https://example.test/anything')).toBe(true);
    expect(policy.crawlDelayMs).toBeNull();
  });
});
