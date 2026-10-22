import type { IssueOccurrence, PageCheck } from '../../check.js';
import { isValidHreflang } from '../../iso-codes.js';
import { hreflangAlternatesOf } from './hreflang-facts.js';

/** A wrong hreflang code is ignored by search engines, so the alternate version is never served. */
export const check23: PageCheck = {
  id: 23,
  severity: 'error',
  theme: 'international',
  scope: 'page',
  label: 'Valeurs hreflang invalides',
  applies: (page) => hreflangAlternatesOf(page).length > 0,
  run: ({ crawl }) =>
    crawl.pages.flatMap((page): IssueOccurrence[] => {
      const invalid = hreflangAlternatesOf(page)
        .map(({ lang }) => lang)
        .filter((value) => !isValidHreflang(value));
      return invalid.length === 0 ? [] : [{ checkId: 23, pageUrl: page.url, info: { invalid } }];
    }),
};
