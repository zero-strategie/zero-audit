import { createHash } from 'node:crypto';
import { load, type CheerioAPI } from 'cheerio';
import type {
  CappedExamples,
  HtmlParser,
  Hreflang,
  JsonLdFacts,
  JsonLdInvalidReason,
  MetaRefresh,
  ParsedHtml,
  SemanticElement,
  RawLink,
} from '../application/ports/html-parser.js';
import { MAX_FACT_EXAMPLES } from '../domain/thresholds.js';
import { isMalformedHref, resolveUrl } from '../domain/url.js';

const TEXT_NODE_TYPE = 3;
const NON_VISIBLE_SELECTOR = 'script, style, noscript, template';

const CHARSET_IN_CONTENT_TYPE = /charset\s*=\s*([^\s;]+)/i;

const CANONICAL_SELECTOR = 'link[rel~="canonical" i][href]';
const HREFLANG_SELECTOR = 'link[rel~="alternate" i][hreflang][href]';
const RESOURCE_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  img: ['src', 'srcset'],
  script: ['src'],
  link: ['href'],
  iframe: ['src'],
  source: ['src', 'srcset'],
  video: ['src', 'poster'],
  audio: ['src'],
  embed: ['src'],
  object: ['data'],
};
const RESOURCE_SELECTOR = [
  'img',
  'script',
  'link[rel~="stylesheet" i]',
  'iframe',
  'source',
  'video',
  'audio',
  'embed',
  'object',
].join(', ');
const SRCSET_SEPARATOR = /,\s+|\s*,(?=\s*(?:https?:)?\/\/)/;
const HTTP_SCHEME = /^http:\/\//i;
const FEED_SELECTOR = ['rss+xml', 'atom+xml', 'feed+json']
  .map((type) => `link[rel~="alternate" i][type="application/${type}" i][href]`)
  .join(', ');
const META_REFRESH = /^\s*(\d+)\s*(?:[;,]\s*(?:url\s*=\s*)?(.*))?$/i;
const SEMANTIC_ELEMENTS: readonly SemanticElement[] = [
  'main',
  'article',
  'section',
  'nav',
  'header',
  'footer',
];
const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const FRAME_TAG = /<frame(?:set)?[\s/>]/i;
const LEADING_DOCTYPE = /^(?:\s|<!--[\s\S]*?-->)*<!doctype\s/i;

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const typesOf = (node: JsonObject): string[] => {
  const declared = node['@type'];
  const list = Array.isArray(declared) ? declared : [declared];
  return list.filter((type): type is string => typeof type === 'string' && type !== '');
};

const topLevelNodes = (context: JsonObject): unknown[] => {
  const graph = context['@graph'];
  return Array.isArray(graph) ? graph : [context];
};

const parseJson = (text: string): { value: unknown } | null => {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return null;
  }
};

/** Returns the types found, or the reason why the block is invalid. */
const inspectJsonLd = (text: string): string[] | JsonLdInvalidReason => {
  const parsed = parseJson(text);
  if (parsed === null) return 'unparseable';
  const root = parsed.value;
  const contexts: unknown[] = Array.isArray(root) ? root : [root];
  const types: string[] = [];
  for (const context of contexts) {
    if (!isObject(context) || context['@context'] === undefined) return 'missing-context';
    for (const node of topLevelNodes(context)) {
      const nodeTypes = isObject(node) ? typesOf(node) : [];
      if (nodeTypes.length === 0) return 'missing-type';
      types.push(...nodeTypes);
    }
  }
  return types;
};

const normalizeSpaces = (text: string): string => text.replace(/\s+/g, ' ').trim();
const orNull = (text: string): string | null => (text === '' ? null : text);

export class CheerioHtmlParser implements HtmlParser {
  parse(html: string, pageUrl: string): ParsedHtml {
    const $ = load(html);
    const visibleText = this.extractVisibleText($);
    const baseUrl = this.baseUrlOf($, pageUrl);
    return {
      links: this.extractLinks($, baseUrl),
      title: this.extractTitle($),
      metaDescription: $('meta[name="description" i]').first().attr('content')?.trim() ?? null,
      canonical: this.extractCanonical($, pageUrl),
      metaRefresh: this.extractMetaRefresh($, baseUrl),
      canonicalCount: $(CANONICAL_SELECTOR).length,
      canonicalUrls: this.extractCanonicalUrls($, pageUrl),
      h1: $('h1')
        .toArray()
        .map((element) => normalizeSpaces($(element).text())),
      wordCount: this.countWords(visibleText),
      textRatio: this.measureTextRatio(visibleText, html),
      contentHash: createHash('sha256').update(html).digest('hex'),
      viewport: $('meta[name="viewport" i]').first().attr('content') ?? null,
      charset: this.extractCharset($),
      hasDoctype: LEADING_DOCTYPE.test(html),
      imagesWithoutAlt: this.extractImagesWithoutAlt($),
      jsonLd: this.extractJsonLd($),
      semanticElements: SEMANTIC_ELEMENTS.filter((tag) => $(tag).length > 0),
      htmlBytes: Buffer.byteLength(html, 'utf8'),
      hreflang: this.extractHreflang($, baseUrl),
      malformedLinks: this.extractMalformedLinks($, baseUrl),
      insecureResources: this.extractInsecureResources($, baseUrl),
      declaredFeeds: $(FEED_SELECTOR)
        .toArray()
        .flatMap((element) => resolveUrl($(element).attr('href') ?? '', baseUrl) ?? []),
      hasFrames: FRAME_TAG.test(html.replace(HTML_COMMENT, '')),
      lang: orNull($('html').first().attr('lang')?.trim() ?? ''),
    };
  }

  private baseUrlOf($: CheerioAPI, pageUrl: string): string {
    const baseHref = $('base[href]').first().attr('href');
    return (baseHref === undefined ? null : resolveUrl(baseHref, pageUrl)) ?? pageUrl;
  }

  private extractLinks($: CheerioAPI, baseUrl: string): RawLink[] {
    const anchors = $('a[href]')
      .toArray()
      .map((element) => ({
        href: $(element).attr('href'),
        kind: 'anchor' as const,
        rel: $(element).attr('rel') ?? null,
        anchor: orNull(normalizeSpaces($(element).text())),
      }));
    const resources = [
      ...$('link[rel~="stylesheet"][href]')
        .toArray()
        .map((e) => $(e).attr('href')),
      ...$('script[src]')
        .toArray()
        .map((e) => $(e).attr('src')),
      ...$('img[src]')
        .toArray()
        .map((e) => $(e).attr('src')),
    ].map((href) => ({ href, kind: 'resource' as const, rel: null, anchor: null }));

    return [...anchors, ...resources].flatMap(({ href, ...rest }) => {
      const targetUrl = resolveUrl(href ?? '', baseUrl);
      return targetUrl === null ? [] : [{ targetUrl, ...rest }];
    });
  }

  private extractHreflang($: CheerioAPI, baseUrl: string): Hreflang[] {
    return $(HREFLANG_SELECTOR)
      .toArray()
      .flatMap((element) => {
        const url = resolveUrl($(element).attr('href') ?? '', baseUrl);
        return url === null ? [] : [{ lang: $(element).attr('hreflang') ?? '', url }];
      });
  }

  private extractMalformedLinks($: CheerioAPI, baseUrl: string): CappedExamples {
    const hrefs = $('a[href]')
      .toArray()
      .map((element) => $(element).attr('href') ?? '')
      .filter((href) => isMalformedHref(href, baseUrl));
    return { total: hrefs.length, examples: hrefs.slice(0, MAX_FACT_EXAMPLES) };
  }

  private extractInsecureResources($: CheerioAPI, baseUrl: string): CappedExamples {
    const urls = $(RESOURCE_SELECTOR)
      .toArray()
      .flatMap((element) =>
        (RESOURCE_ATTRIBUTES[$(element).prop('tagName')?.toLowerCase() ?? ''] ?? []).flatMap(
          (attribute) => this.urlsOfAttribute(attribute, $(element).attr(attribute) ?? ''),
        ),
      )
      .flatMap((candidate) => (candidate === '' ? [] : (resolveUrl(candidate, baseUrl) ?? [])))
      .filter((resolved) => HTTP_SCHEME.test(resolved));
    return { total: urls.length, examples: urls.slice(0, MAX_FACT_EXAMPLES) };
  }

  private urlsOfAttribute(attribute: string, value: string): string[] {
    if (attribute !== 'srcset') return [value.trim()];
    return value.split(SRCSET_SEPARATOR).map((candidate) => candidate.trim().split(/\s+/)[0] ?? '');
  }

  private extractCanonical($: CheerioAPI, pageUrl: string): string | null {
    const href = $(CANONICAL_SELECTOR).first().attr('href');
    return href === undefined ? null : resolveUrl(href, pageUrl);
  }

  private extractCanonicalUrls($: CheerioAPI, pageUrl: string): string[] {
    return $(CANONICAL_SELECTOR)
      .toArray()
      .flatMap((element) => {
        const resolved = resolveUrl($(element).attr('href') ?? '', pageUrl);
        return resolved === null ? [] : [resolved];
      })
      .slice(0, MAX_FACT_EXAMPLES);
  }

  private extractCharset($: CheerioAPI): string | null {
    const direct = $('meta[charset]').first().attr('charset')?.trim();
    if (direct) return direct;
    const contentType = $('meta[http-equiv="content-type" i]').first().attr('content') ?? '';
    return CHARSET_IN_CONTENT_TYPE.exec(contentType)?.[1] ?? null;
  }

  private extractMetaRefresh($: CheerioAPI, baseUrl: string): MetaRefresh | null {
    const content = $('meta[http-equiv="refresh" i]').first().attr('content');
    const match = content === undefined ? null : META_REFRESH.exec(content);
    if (match?.[1] === undefined) return null;
    const rawTarget = match[2]?.trim().replace(/^(["'])(.*)\1$/, '$2');
    const target = rawTarget ? resolveUrl(rawTarget, baseUrl) : null;
    return { delaySeconds: Number(match[1]), target };
  }

  private extractImagesWithoutAlt($: CheerioAPI): CappedExamples {
    const sources = $('img:not([alt])')
      .toArray()
      .map((element) => $(element).attr('src') ?? '');
    return { total: sources.length, examples: sources.slice(0, MAX_FACT_EXAMPLES) };
  }

  private extractJsonLd($: CheerioAPI): JsonLdFacts {
    const blocks = $('script[type="application/ld+json" i]').toArray();
    const types = new Set<string>();
    const invalidReasons: JsonLdInvalidReason[] = [];
    for (const block of blocks) {
      const found = inspectJsonLd($(block).text());
      if (typeof found === 'string') invalidReasons.push(found);
      else found.forEach((type) => types.add(type));
    }
    return {
      count: blocks.length,
      invalid: invalidReasons.length,
      types: [...types],
      invalidReasons,
    };
  }

  private extractTitle($: CheerioAPI): string | null {
    const title = $('head > title').first();
    return title.length === 0 ? null : normalizeSpaces(title.text());
  }

  private extractVisibleText($: CheerioAPI): string {
    const body = $('body').clone();
    body.find(NON_VISIBLE_SELECTOR).remove();
    return body
      .find('*')
      .addBack()
      .contents()
      .toArray()
      .flatMap((node) => (node.nodeType === TEXT_NODE_TYPE ? [node.data] : []))
      .join(' ');
  }

  private countWords(visibleText: string): number {
    return visibleText.split(/\s+/u).filter((word) => word !== '').length;
  }

  private measureTextRatio(visibleText: string, html: string): number {
    const htmlBytes = Buffer.byteLength(html, 'utf8');
    if (htmlBytes === 0) return 0;
    return Buffer.byteLength(normalizeSpaces(visibleText), 'utf8') / htmlBytes;
  }
}
