import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';
import type { ParsedSitemap, SitemapReader } from '../application/ports/sitemap-reader.js';

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

  parse(xml: string): ParsedSitemap | null {
    if (!isValidXml(xml)) return null;
    const document = this.parser.parse(xml) as {
      urlset?: Container | '';
      sitemapindex?: Container | '';
    };
    if (document.urlset !== undefined) {
      return { kind: 'urlset', locs: extractLocs(document.urlset, 'url') };
    }
    if (document.sitemapindex !== undefined) {
      return { kind: 'index', locs: extractLocs(document.sitemapindex, 'sitemap') };
    }
    return null;
  }
}
