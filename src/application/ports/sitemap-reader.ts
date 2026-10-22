export interface ParsedSitemap {
  kind: 'urlset' | 'index';
  locs: readonly string[];
}

export interface SitemapReadResult {
  /** Null when the content is not an accepted sitemap document. */
  sitemap: ParsedSitemap | null;
  malformedXml: boolean;
}

export interface SitemapReader {
  parse(xml: string): SitemapReadResult;
}
