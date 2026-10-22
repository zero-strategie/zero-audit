import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { runChecks } from '../../src/application/run-checks.js';
import { CheckRegistry } from '../../src/domain/check.js';
import type { Check, CheckResult } from '../../src/domain/check.js';
import type {
  CrawlResult,
  HostProbe,
  Link,
  Page,
  SlashVariantProbe,
} from '../../src/domain/crawl.js';

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
  canonical: null,
  h1: ['Titre'],
  wordCount: 300,
  textRatio: 0.3,
  contentHash: null,
  blockedByRobots: false,
  ...overrides,
});

export const makeHostProbe = (overrides: Partial<HostProbe> = {}): HostProbe => ({
  url: 'https://www.exemple.com/',
  status: 200,
  error: null,
  isHtml: true,
  canonical: null,
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
  hostProbe: HostProbe | null = null,
  slashProbes: SlashVariantProbe[] = [],
  blockedPages: Page[] = [],
): CrawlResult => ({
  rootUrl: 'https://exemple.com/',
  internalHost: 'exemple.com',
  pages,
  blockedPages,
  links,
  siteFiles: [],
  hostProbe,
  slashProbes,
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
  checks: { id: number; severity: string }[];
}

interface TitleHashes {
  sha256: string[];
}

const catalogue = JSON.parse(
  readFileSync(new URL('./check-catalogue.json', import.meta.url), 'utf8'),
) as Catalogue;

const titleHashes = new Set(
  (
    JSON.parse(
      readFileSync(new URL('./catalogue-title-hashes.json', import.meta.url), 'utf8'),
    ) as TitleHashes
  ).sha256,
);

/** True when the text, lower-cased and trimmed, is one of the reference catalogue titles. */
export const isCatalogueTitle = (text: string): boolean =>
  titleHashes.has(createHash('sha256').update(text.trim().toLowerCase()).digest('hex'));

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
    const entry = catalogue.checks.find((i) => i.id === check.id);
    expect(entry?.severity).toBe(check.severity);
    expect(check.severity).toBe(expectedSeverities[check.id]);
  }
};

export const expectNoCatalogueTitleCopied = (checks: readonly Check[]): void => {
  for (const check of checks) {
    expect(isCatalogueTitle(check.label)).toBe(false);
  }
};
