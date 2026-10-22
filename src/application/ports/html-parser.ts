export type RawLinkKind = 'anchor' | 'resource';

export interface RawLink {
  /** Absolute, normalized URL, resolved against `<base href>` when present. */
  targetUrl: string;
  kind: RawLinkKind;
  rel: string | null;
  anchor: string | null;
}

export interface MetaRefresh {
  delaySeconds: number;
  /** Absolute URL, null for a plain reload (no `url=`). */
  target: string | null;
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
  /** True when the raw html starts with a doctype (comments and whitespace allowed before). */
  hasDoctype: boolean;
  /** `lang` attribute of `<html>`, null when absent or empty. */
  lang: string | null;
  /** Number of `<link rel="canonical">` elements, duplicates included. */
  canonicalCount: number;
  /** First `<meta http-equiv="refresh">` with a valid delay, else null. */
  metaRefresh: MetaRefresh | null;
}

export interface HtmlParser {
  parse(html: string, pageUrl: string): ParsedHtml;
}
