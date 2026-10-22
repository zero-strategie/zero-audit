import type { CrawlResult, Link } from '../crawl.js';

const WHITESPACE = /\s+/;

/** A `rel` attribute is a space-separated token list, compared without case. */
export const hasRelToken = (rel: string | null, token: string): boolean =>
  rel !== null && rel.toLowerCase().split(WHITESPACE).includes(token);

export type LinkFilter = (link: Link) => boolean;

/** Source page URL -> sorted, de-duplicated target URLs of the links kept by `filter`. */
export const targetsBySource = (
  links: readonly Link[],
  filter: LinkFilter,
): Map<string, string[]> => {
  const grouped = new Map<string, Set<string>>();
  for (const link of links) {
    if (!filter(link)) continue;
    const targets = grouped.get(link.sourceUrl) ?? new Set<string>();
    targets.add(link.targetUrl);
    grouped.set(link.sourceUrl, targets);
  }
  return new Map([...grouped].map(([source, targets]) => [source, [...targets].sort()]));
};

const indexes = new WeakMap<CrawlResult, WeakMap<LinkFilter, Map<string, string[]>>>();

/** Same as `targetsBySource`, computed once per crawl and filter (checks call it from `applies` and `run`). */
export const indexedTargetsBySource = (
  crawl: CrawlResult,
  filter: LinkFilter,
): Map<string, string[]> => {
  const byFilter = indexes.get(crawl) ?? new WeakMap<LinkFilter, Map<string, string[]>>();
  indexes.set(crawl, byFilter);
  const cached = byFilter.get(filter);
  if (cached) return cached;
  const built = targetsBySource(crawl.links, filter);
  byFilter.set(filter, built);
  return built;
};
