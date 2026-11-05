import type { PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isHtml2xx } from './page-predicates.js';

interface MalformedLinks {
  readonly total: number;
  readonly examples: readonly unknown[];
}

const isMalformedLinks = (value: unknown): value is MalformedLinks =>
  typeof value === 'object' &&
  value !== null &&
  'total' in value &&
  typeof value.total === 'number' &&
  'examples' in value &&
  Array.isArray(value.examples);

/** `undefined` when the page cannot be judged (not HTML 2xx, no facts as in old snapshots). */
const malformedLinksOf = (page: Page): MalformedLinks | undefined => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return undefined;
  const facts = page.htmlFacts['malformedLinks'];
  return isMalformedLinks(facts) ? facts : undefined;
};

/** The crawler already left out `#`, empty and `javascript:void(0)` hrefs: only broken ones are counted. */
export const check44: PageCheck = {
  id: 44,
  severity: 'error',
  theme: 'linking',
  scope: 'page',
  label: 'Liens au format invalide',
  applies: (page) => malformedLinksOf(page) !== undefined,
  run: ({ crawl }) =>
    crawl.pages.flatMap((page) => {
      const malformed = malformedLinksOf(page);
      if (malformed === undefined || malformed.total === 0) return [];
      return [
        {
          checkId: 44,
          pageUrl: page.url,
          info: { total: malformed.total, examples: [...malformed.examples] },
        },
      ];
    }),
};
