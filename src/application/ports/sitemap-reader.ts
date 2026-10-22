export type SitemapIssueType =
  | 'wrong-namespace'
  | 'missing-loc'
  | 'relative-loc'
  | 'loc-too-long'
  | 'invalid-lastmod'
  | 'invalid-changefreq'
  | 'invalid-priority';

/** A deviation from the sitemaps.org format; the offending entry is still read. */
export interface SitemapIssue {
  type: SitemapIssueType;
  loc: string | null;
  value: string | null;
}

export interface ParsedSitemap {
  kind: 'urlset' | 'index';
  locs: readonly string[];
  /** Number of `<url>` (or `<sitemap>`) entries, including those without a usable loc. */
  entryCount: number;
  issues: readonly SitemapIssue[];
}

export interface SitemapReadResult {
  /** Null when the content is not an accepted sitemap document. */
  sitemap: ParsedSitemap | null;
  malformedXml: boolean;
}

export interface SitemapReader {
  parse(xml: string): SitemapReadResult;
}
