export interface ExtractedLink {
  href: string;
  rel: string | null;
  anchor: string | null;
}

export interface HtmlParser {
  extractLinks(html: string): ExtractedLink[];
}
