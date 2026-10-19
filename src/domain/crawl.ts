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

export interface CrawlResult {
  readonly rootUrl: string;
  readonly internalHost: string;
  readonly pages: readonly Page[];
  /** Pages blocked by robots.txt; kept apart so that checks and the page count never see them. */
  readonly blockedPages: readonly Page[];
  readonly links: readonly Link[];
  readonly site: { readonly robotsFound: boolean; readonly sitemapFound: boolean };
}
