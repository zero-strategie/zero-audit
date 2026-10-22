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
  /** UTF-8 bytes of the visible body text over UTF-8 bytes of the received html, in [0, 1]. */
  textRatio: number;
  contentHash: string;
  /** Raw `content` of `<meta name="viewport">`. */
  viewport: string | null;
  /** Charset declared in the document (`<meta charset>` or `http-equiv=Content-Type`), not the HTTP header. */
  charset: string | null;
}

export interface HtmlParser {
  parse(html: string, pageUrl: string): ParsedHtml;
}
