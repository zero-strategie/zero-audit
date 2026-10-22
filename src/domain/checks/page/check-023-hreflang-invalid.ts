import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isValidHreflang } from '../../iso-codes.js';
import { isHtml2xx } from './page-predicates.js';

/** Raw hreflang values of the page; empty when it cannot be judged (not HTML 2xx, no facts). */
const hreflangValuesOf = (page: Page): readonly string[] => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return [];
  const hreflang = page.htmlFacts['hreflang'];
  if (!Array.isArray(hreflang)) return [];
  return hreflang.flatMap((alternate: unknown) => {
    const lang = (alternate as { lang?: unknown }).lang;
    return typeof lang === 'string' ? [lang] : [];
  });
};

/** A wrong hreflang code is ignored by search engines, so the alternate version is never served. */
export const check23: PageCheck = {
  id: 23,
  severity: 'error',
  theme: 'international',
  scope: 'page',
  label: 'Valeurs hreflang invalides',
  applies: (page) => hreflangValuesOf(page).length > 0,
  run: ({ crawl }) =>
    crawl.pages.flatMap((page): IssueOccurrence[] => {
      const invalid = hreflangValuesOf(page).filter((value) => !isValidHreflang(value));
      return invalid.length === 0 ? [] : [{ checkId: 23, pageUrl: page.url, info: { invalid } }];
    }),
};
