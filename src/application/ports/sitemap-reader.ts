export interface ParsedSitemap {
  kind: 'urlset' | 'index';
  locs: readonly string[];
}

export interface SitemapReader {
  /** Returns null when the content is not a valid sitemap document. */
  parse(xml: string): ParsedSitemap | null;
}
