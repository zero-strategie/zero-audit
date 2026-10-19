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
  readonly contentHash: string | null;
  /** Internal URL forbidden by robots.txt: recorded without any request. */
  readonly blockedByRobots: boolean;
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
  /** Null when the root host is an IP or localhost: no alternate host exists. */
  readonly hostProbe: HostProbe | null;
  readonly slashProbes: readonly SlashVariantProbe[];
  /** Whether the file was usable (a sitemap must also parse), which a status alone cannot tell. */
  readonly site: { readonly robotsFound: boolean; readonly sitemapFound: boolean };
}
