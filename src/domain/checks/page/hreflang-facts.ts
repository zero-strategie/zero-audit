import type { Page } from '../../crawl.js';
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
