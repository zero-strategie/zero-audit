import type { Page } from '../../crawl.js';
import { normalizeUrl } from '../../url.js';
import { isHtml2xx } from './page-predicates.js';

export interface HreflangAlternate {
  readonly lang: string;
  readonly url: string;
}

/** Hreflang alternates of the page; empty when it cannot be judged (not HTML 2xx, no facts). */
export const hreflangAlternatesOf = (page: Page): readonly HreflangAlternate[] => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return [];
  const hreflang = page.htmlFacts['hreflang'];
  if (!Array.isArray(hreflang)) return [];
  return hreflang.flatMap((alternate: unknown) => {
    const { lang, url } = alternate as { lang?: unknown; url?: unknown };
    return typeof lang === 'string' && typeof url === 'string' ? [{ lang, url }] : [];
  });
};

const normalizeOrSelf = (url: string): string => {
  try {
    return normalizeUrl(url);
  } catch {
    return url;
  }
};

export interface CrawledHreflangTarget extends HreflangAlternate {
  readonly target: Page;
}

/** Index of the crawled pages by normalised URL, built once per check run. */
export const indexPagesByUrl = (pages: readonly Page[]): ReadonlyMap<string, Page> =>
  new Map(pages.map((page) => [page.url, page]));

/** Alternates of the page whose target was already crawled; uncrawled targets are never queued (A5). */
export const crawledHreflangTargetsOf = (
  page: Page,
  pagesByUrl: ReadonlyMap<string, Page>,
): CrawledHreflangTarget[] =>
  hreflangAlternatesOf(page).flatMap((alternate) => {
    const target = pagesByUrl.get(normalizeOrSelf(alternate.url));
    return target === undefined ? [] : [{ ...alternate, target }];
  });
