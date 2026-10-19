import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { runChecks } from '../../src/application/run-checks.js';
import { CheckRegistry } from '../../src/domain/check.js';
import type { Check, CheckResult } from '../../src/domain/check.js';
import type { CrawlResult, Link, Page } from '../../src/domain/crawl.js';

export const makePage = (url: string, overrides: Partial<Page> = {}): Page => ({
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
  title: 'Un titre de page suffisamment long',
  metaDescription: 'Une description',
  h1: ['Titre'],
  wordCount: 300,
  contentHash: null,
  blockedByRobots: false,
  ...overrides,
});

export const makeLink = (
  sourceUrl: string,
  targetUrl: string,
  overrides: Partial<Link> = {},
): Link => ({ sourceUrl, targetUrl, type: 'internal', rel: null, anchor: null, ...overrides });

export const crawlOf = (
  pages: Page[],
  links: Link[] = [],
  site: CrawlResult['site'] = { robotsFound: false, sitemapFound: false },
): CrawlResult => ({
  rootUrl: 'https://exemple.com/',
  internalHost: 'exemple.com',
  pages,
  blockedPages: [],
  links,
  siteFiles: [],
  site,
});

export const runCheck = (
  checks: readonly Check[],
  checkId: number,
  crawl: CrawlResult,
): CheckResult => {
  const result = runChecks(crawl, new CheckRegistry(checks)).find((r) => r.checkId === checkId);
  if (!result) throw new Error(`check ${String(checkId)} missing`);
  return result;
};

export const flaggedUrls = (result: CheckResult): (string | null)[] =>
  result.occurrences.map((o) => o.pageUrl);

export const u = (name: string): string => `https://exemple.com/${name}`;

interface Catalogue {
  issues: { id: number; severity: string; title_fr: string | null; title_en: string | null }[];
}

const catalogue = JSON.parse(
  readFileSync(new URL('../../docs/reference/site-audit-issues.json', import.meta.url), 'utf8'),
) as Catalogue;

export const expectCatalogueMetadata = (
  checks: readonly Check[],
  expectedSeverities: Record<number, string>,
): void => {
  expect(checks.map((c) => c.id).sort((a, b) => a - b)).toEqual(
    Object.keys(expectedSeverities)
      .map(Number)
      .sort((a, b) => a - b),
  );
  for (const check of checks) {
    const entry = catalogue.issues.find((i) => i.id === check.id);
    expect(entry?.severity).toBe(check.severity);
    expect(check.severity).toBe(expectedSeverities[check.id]);
  }
};

export const expectNoCatalogueTitleCopied = (checks: readonly Check[]): void => {
  const titles = new Set(
    catalogue.issues.flatMap((i) =>
      [i.title_fr, i.title_en].flatMap((t) => (t === null ? [] : [t.toLowerCase()])),
    ),
  );
  for (const check of checks) {
    expect(titles.has(check.label.toLowerCase())).toBe(false);
  }
};
