import { createHash } from 'node:crypto';
import { load, type CheerioAPI } from 'cheerio';
import type { HtmlParser, ParsedHtml, RawLink } from '../application/ports/html-parser.js';
import { resolveUrl } from '../domain/url.js';

const NON_VISIBLE_SELECTOR = 'script, style, noscript, template';

const normalizeSpaces = (text: string): string => text.replace(/\s+/g, ' ').trim();
const orNull = (text: string): string | null => (text === '' ? null : text);

export class CheerioHtmlParser implements HtmlParser {
  parse(html: string, pageUrl: string): ParsedHtml {
    const $ = load(html);
    return {
      links: this.extractLinks($, this.baseUrlOf($, pageUrl)),
      title: this.extractTitle($),
      metaDescription: $('meta[name="description" i]').first().attr('content')?.trim() ?? null,
      h1: $('h1')
        .toArray()
        .map((element) => normalizeSpaces($(element).text())),
      wordCount: this.countWords($),
      contentHash: createHash('sha256').update(html).digest('hex'),
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

  private extractTitle($: CheerioAPI): string | null {
    const title = $('head > title').first();
    return title.length === 0 ? null : normalizeSpaces(title.text());
  }

  private countWords($: CheerioAPI): number {
    const body = $('body').clone();
    body.find(NON_VISIBLE_SELECTOR).remove();
    const text = body
      .find('*')
      .addBack()
      .contents()
      .toArray()
      .flatMap((node) => (node.type === 'text' ? [node.data] : []))
      .join(' ');
    return text.split(/\s+/u).filter((word) => word !== '').length;
  }
}
