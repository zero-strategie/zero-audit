import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';
import type {
  ParsedSitemap,
  SitemapIssue,
  SitemapIssueType,
  SitemapReader,
  SitemapReadResult,
} from '../application/ports/sitemap-reader.js';

type Entry = Record<string, unknown>;
type Container = Record<string, Entry | Entry[] | '' | undefined>;
type RootKind = ParsedSitemap['kind'];

const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const MAX_LOC_LENGTH = 2048;
const CHANGE_FREQUENCIES: ReadonlySet<string> = new Set([
  'always',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'never',
]);
const W3C_DATETIME =
  /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01])(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?)?)?$/;
const PRIORITY_FORMAT = /^(?:\d+\.?\d*|\.\d+)$/;
const XML_COMMENTS = /<!--[\s\S]*?-->/g;
const ROOT_START_TAG = /<(?:([\w.-]+):)?(urlset|sitemapindex)\b([^>]*)>/;

const isValidXml = (xml: string): boolean => {
  try {
    return new SyntaxValidator().validate(xml);
  } catch {
    return false;
  }
};

const texts = (value: unknown): string[] => {
  const values = Array.isArray(value) ? (value as unknown[]) : [value];
  return values.flatMap((item) => (typeof item === 'string' ? [item.trim()] : []));
};

const hasSitemapNamespace = (xml: string): boolean => {
  const root = ROOT_START_TAG.exec(xml.replace(XML_COMMENTS, ''));
  if (root === null) return false;
  const [, prefix, , attributes = ''] = root;
  const attributeName = prefix === undefined ? 'xmlns' : `xmlns:${prefix}`;
  return new RegExp(`\\s${attributeName}\\s*=\\s*["']${SITEMAP_NAMESPACE}["']`).test(attributes);
};

const isAbsoluteUrl = (loc: string): boolean => {
  if (!URL.canParse(loc)) return false;
  const { protocol } = new URL(loc);
  return protocol === 'http:' || protocol === 'https:';
};

const isPriority = (value: string): boolean =>
  PRIORITY_FORMAT.test(value) && Number(value) >= 0 && Number(value) <= 1;

const formatChecks: readonly {
  field: string;
  type: SitemapIssueType;
  isValid: (value: string) => boolean;
  kinds: readonly RootKind[];
}[] = [
  {
    field: 'lastmod',
    type: 'invalid-lastmod',
    isValid: (v) => W3C_DATETIME.test(v),
    kinds: ['urlset', 'index'],
  },
  {
    field: 'changefreq',
    type: 'invalid-changefreq',
    isValid: (v) => CHANGE_FREQUENCIES.has(v),
    kinds: ['urlset'],
  },
  { field: 'priority', type: 'invalid-priority', isValid: isPriority, kinds: ['urlset'] },
];

const issuesOfEntry = (entry: Entry, kind: RootKind, locs: string[]): SitemapIssue[] => {
  const [loc] = texts(entry['loc']);
  if (loc === undefined || loc === '') return [{ type: 'missing-loc', loc: null, value: null }];
  locs.push(loc);

  const issues: SitemapIssue[] = [];
  if (!isAbsoluteUrl(loc)) issues.push({ type: 'relative-loc', loc, value: null });
  if (loc.length > MAX_LOC_LENGTH) issues.push({ type: 'loc-too-long', loc, value: null });
  for (const { field, type, isValid, kinds } of formatChecks) {
    if (!kinds.includes(kind)) continue;
    for (const value of texts(entry[field])) {
      if (!isValid(value)) issues.push({ type, loc, value });
    }
  }
  return issues;
};

const entriesOf = (container: Container | '', entryName: string): Entry[] => {
  const entries = container === '' ? undefined : container[entryName];
  if (entries === undefined) return [];
  const list = Array.isArray(entries) ? entries : [entries];
  return list.map((entry) => (typeof entry === 'object' ? entry : {}));
};

const readEntries = (
  container: Container | '',
  kind: RootKind,
  entryName: string,
  namespaceDeclared: boolean,
): ParsedSitemap => {
  const entries = entriesOf(container, entryName);
  const locs: string[] = [];
  const issues: SitemapIssue[] = namespaceDeclared
    ? []
    : [{ type: 'wrong-namespace', loc: null, value: null }];
  for (const entry of entries) issues.push(...issuesOfEntry(entry, kind, locs));
  return { kind, locs, entryCount: entries.length, issues };
};

export class FastXmlSitemapReader implements SitemapReader {
  private readonly parser = new XMLParser({ removeNSPrefix: true, parseTagValue: false });

  parse(xml: string): SitemapReadResult {
    if (!isValidXml(xml)) return { sitemap: null, malformedXml: true };
    const document = this.parser.parse(xml) as {
      urlset?: Container | '';
      sitemapindex?: Container | '';
    };
    const namespaceDeclared = hasSitemapNamespace(xml);
    if (document.urlset !== undefined) {
      const sitemap = readEntries(document.urlset, 'urlset', 'url', namespaceDeclared);
      return { sitemap, malformedXml: false };
    }
    if (document.sitemapindex !== undefined) {
      const sitemap = readEntries(document.sitemapindex, 'index', 'sitemap', namespaceDeclared);
      return { sitemap, malformedXml: false };
    }
    return { sitemap: null, malformedXml: false };
  }
}
