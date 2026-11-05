import { MAX_FACT_EXAMPLES } from './thresholds.js';

export type FactValue =
  string | number | boolean | null | readonly FactValue[] | { readonly [key: string]: FactValue };

export { MAX_FACT_EXAMPLES };

/** Capped list of examples with the real total, so a huge page cannot bloat a snapshot. */
export interface CappedExamples<T extends FactValue> {
  readonly total: number;
  readonly examples: readonly T[];
}

/** Facts extracted from the HTML of a page; sections are added by the checks that need them. */
export type HtmlFacts = { readonly [section: string]: FactValue };

/** Facts extracted from a technical site file (robots.txt, sitemap or llms.txt). */
export type SiteFileFacts = { readonly [section: string]: FactValue };

export interface Page {
  readonly url: string;
  readonly depth: number;
  readonly status: number | null;
  readonly error: string | null;
  readonly redirectTarget: string | null;
  readonly redirectChain: readonly string[];
  readonly headers: Readonly<Record<string, string>>;
  readonly responseTimeMs: number;
  readonly contentType: string | null;
  readonly isHtml: boolean;
  readonly title: string | null;
  readonly metaDescription: string | null;
  /** Absolute URL declared by `<link rel="canonical">`, null when absent. */
  readonly canonical: string | null;
  readonly h1: readonly string[];
  readonly wordCount: number | null;
  /** Visible text bytes over received html bytes, null for non-HTML pages and older snapshots. */
  readonly textRatio: number | null;
  readonly contentHash: string | null;
  /** Internal URL forbidden by robots.txt: recorded without any request. */
  readonly blockedByRobots: boolean;
  /** Null for non-HTML pages, pages not yet analysed and snapshots written before facts existed. */
  readonly htmlFacts: HtmlFacts | null;
  /** Whether the sitemap lists this page; null when no sitemap was read or for older snapshots. */
  readonly inSitemap: boolean | null;
}

export type LinkType = 'internal' | 'external' | 'resource';

export interface Link {
  readonly sourceUrl: string;
  readonly targetUrl: string;
  readonly type: LinkType;
  readonly rel: string | null;
  readonly anchor: string | null;
}

export type SiteFileKind = 'robots' | 'sitemap' | 'llms';

/** Technical file requested outside the crawl: never counted as a crawled page. */
export interface SiteFile {
  readonly kind: SiteFileKind;
  readonly url: string;
  readonly status: number | null;
  /** Network failure kind when no response was received. */
  readonly error: string | null;
  /** Null when nothing was extracted and for snapshots written before facts existed. */
  readonly facts: SiteFileFacts | null;
}

/** Single request to the home page of the alternate host (www. or apex); never a crawled page. */
export interface HostProbe {
  readonly url: string;
  readonly status: number | null;
  /** Network failure kind when no response was received. */
  readonly error: string | null;
  readonly isHtml: boolean;
  /** Absolute canonical URL declared by the probed page, null when absent. */
  readonly canonical: string | null;
}

/** Single request to the other trailing-slash form of an explored page; never a crawled page. */
export interface SlashVariantProbe {
  readonly url: string;
  /** Explored page whose variant was probed. */
  readonly sourcePageUrl: string;
  readonly status: number | null;
  /** Network failure kind when no response was received. */
  readonly error: string | null;
  readonly isHtml: boolean;
  /** Absolute canonical URL declared by the probed page, null when absent. */
  readonly canonical: string | null;
}

export interface CrawlResult {
  readonly rootUrl: string;
  readonly internalHost: string;
  readonly pages: readonly Page[];
  /** Pages blocked by robots.txt; kept apart so that checks and the page count never see them. */
  readonly blockedPages: readonly Page[];
  readonly links: readonly Link[];
  readonly siteFiles: readonly SiteFile[];
  /** Normalized internal page URLs listed by the sitemaps, children included; not persisted. */
  readonly sitemapUrls: readonly string[];
  /** Null when the root host is an IP or localhost: no alternate host exists. */
  readonly hostProbe: HostProbe | null;
  readonly slashProbes: readonly SlashVariantProbe[];
  /** Whether the file was usable (a sitemap must also parse), which a status alone cannot tell. */
  readonly site: { readonly robotsFound: boolean; readonly sitemapFound: boolean };
}
