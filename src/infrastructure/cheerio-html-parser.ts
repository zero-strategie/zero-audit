import { load } from 'cheerio';
import type { ExtractedLink, HtmlParser } from '../application/ports/html-parser.js';

const normalizeSpaces = (text: string): string => text.replace(/\s+/g, ' ').trim();

export class CheerioHtmlParser implements HtmlParser {
  extractLinks(html: string): ExtractedLink[] {
    const $ = load(html);
    return $('a[href]')
      .toArray()
      .map((element) => {
        const anchor = normalizeSpaces($(element).text());
        return {
          href: $(element).attr('href') ?? '',
          rel: $(element).attr('rel') ?? null,
          anchor: anchor === '' ? null : anchor,
        };
      });
  }
}
