import type { HtmlFacts } from '../domain/crawl.js';
import type { ParsedHtml } from './ports/html-parser.js';

/** Keeps only what page checks read; links, title and the like already live on `Page`. */
export const toHtmlFacts = (parsed: ParsedHtml): HtmlFacts => ({
  viewport: parsed.viewport,
  charset: parsed.charset,
  hasDoctype: parsed.hasDoctype,
  lang: parsed.lang,
  canonicalCount: parsed.canonicalCount,
  metaRefresh: parsed.metaRefresh && { ...parsed.metaRefresh },
  imagesWithoutAlt: { ...parsed.imagesWithoutAlt },
  hasFrames: parsed.hasFrames,
  jsonLd: { ...parsed.jsonLd },
  semanticElements: parsed.semanticElements,
  htmlBytes: parsed.htmlBytes,
  hreflang: parsed.hreflang.map((alternate) => ({ ...alternate })),
  malformedLinks: { ...parsed.malformedLinks },
  insecureResources: { ...parsed.insecureResources },
  declaredFeeds: parsed.declaredFeeds,
});
