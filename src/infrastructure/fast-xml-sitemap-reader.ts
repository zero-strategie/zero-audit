import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';
import type { SitemapReader, SitemapReadResult } from '../application/ports/sitemap-reader.js';

type Entry = { loc?: unknown };
type Container = Record<string, Entry | Entry[] | '' | undefined>;

const isValidXml = (xml: string): boolean => {
  try {
    return new SyntaxValidator().validate(xml);
  } catch {
    return false;
  }
};

const extractLocs = (container: Container | '', entryName: string): string[] => {
  const entries = container === '' ? undefined : container[entryName];
  if (entries === undefined || entries === '') return [];
  const list: Entry[] = Array.isArray(entries) ? entries : [entries];
  return list.flatMap(({ loc }) =>
    typeof loc === 'string' && loc.trim() !== '' ? [loc.trim()] : [],
  );
};

export class FastXmlSitemapReader implements SitemapReader {
  private readonly parser = new XMLParser({ removeNSPrefix: true });

  parse(xml: string): SitemapReadResult {
    if (!isValidXml(xml)) return { sitemap: null, malformedXml: true };
    const document = this.parser.parse(xml) as {
      urlset?: Container | '';
      sitemapindex?: Container | '';
    };
    if (document.urlset !== undefined) {
      const locs = extractLocs(document.urlset, 'url');
      return { sitemap: { kind: 'urlset', locs }, malformedXml: false };
    }
    if (document.sitemapindex !== undefined) {
      const locs = extractLocs(document.sitemapindex, 'sitemap');
      return { sitemap: { kind: 'index', locs }, malformedXml: false };
    }
    return { sitemap: null, malformedXml: false };
  }
}
