export type RawLinkKind = 'anchor' | 'resource';

export interface RawLink {
  /** Absolute, normalized URL, resolved against `<base href>` when present. */
  targetUrl: string;
  kind: RawLinkKind;
  rel: string | null;
  anchor: string | null;
}

export interface ParsedHtml {
  links: RawLink[];
  title: string | null;
  metaDescription: string | null;
  /** Absolute URL of `<link rel="canonical">`, resolved against the page URL. */
  canonical: string | null;
  h1: string[];
  wordCount: number;
  contentHash: string;
}

export interface HtmlParser {
  parse(html: string, pageUrl: string): ParsedHtml;
}
