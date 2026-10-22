import { createHash } from 'node:crypto';
import { load, type CheerioAPI } from 'cheerio';
import type { HtmlParser, ParsedHtml, RawLink } from '../application/ports/html-parser.js';
import { resolveUrl } from '../domain/url.js';

const TEXT_NODE_TYPE = 3;
const NON_VISIBLE_SELECTOR = 'script, style, noscript, template';

const CHARSET_IN_CONTENT_TYPE = /charset\s*=\s*([^\s;]+)/i;

const CANONICAL_SELECTOR = 'link[rel~="canonical" i][href]';
const LEADING_DOCTYPE = /^(?:\s|<!--[\s\S]*?-->)*<!doctype\s/i;

const normalizeSpaces = (text: string): string => text.replace(/\s+/g, ' ').trim();
const orNull = (text: string): string | null => (text === '' ? null : text);

export class CheerioHtmlParser implements HtmlParser {
  parse(html: string, pageUrl: string): ParsedHtml {
    const $ = load(html);
    const visibleText = this.extractVisibleText($);
    return {
      links: this.extractLinks($, this.baseUrlOf($, pageUrl)),
      title: this.extractTitle($),
      metaDescription: $('meta[name="description" i]').first().attr('content')?.trim() ?? null,
      canonical: this.extractCanonical($, pageUrl),
      canonicalCount: $(CANONICAL_SELECTOR).length,
      h1: $('h1')
        .toArray()
        .map((element) => normalizeSpaces($(element).text())),
      wordCount: this.countWords(visibleText),
      textRatio: this.measureTextRatio(visibleText, html),
      contentHash: createHash('sha256').update(html).digest('hex'),
      viewport: $('meta[name="viewport" i]').first().attr('content') ?? null,
      charset: this.extractCharset($),
      hasDoctype: LEADING_DOCTYPE.test(html),
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

  private extractCanonical($: CheerioAPI, pageUrl: string): string | null {
    const href = $(CANONICAL_SELECTOR).first().attr('href');
    return href === undefined ? null : resolveUrl(href, pageUrl);
  }

  private extractCharset($: CheerioAPI): string | null {
    const direct = $('meta[charset]').first().attr('charset')?.trim();
    if (direct) return direct;
    const contentType = $('meta[http-equiv="content-type" i]').first().attr('content') ?? '';
    return CHARSET_IN_CONTENT_TYPE.exec(contentType)?.[1] ?? null;
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
