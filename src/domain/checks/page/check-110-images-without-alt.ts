import type { PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isHtml2xx } from './page-predicates.js';

interface MissingAlt {
  readonly total: number;
  readonly examples: readonly unknown[];
}

const isMissingAlt = (value: unknown): value is MissingAlt =>
  typeof value === 'object' &&
  value !== null &&
  'total' in value &&
  typeof value.total === 'number' &&
  'examples' in value &&
  Array.isArray(value.examples);

/** `undefined` when the page cannot be judged (not HTML 2xx, no facts as in old snapshots). */
const missingAltOf = (page: Page): MissingAlt | undefined => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return undefined;
  const facts = page.htmlFacts['imagesWithoutAlt'];
  return isMissingAlt(facts) ? facts : undefined;
};

/** An empty `alt=""` is legitimate (decorative image) and is not reported: only a missing attribute is. */
export const check110: PageCheck = {
  id: 110,
  severity: 'warning',
  theme: 'on-page',
  scope: 'page',
  label: 'Images sans attribut alt',
  applies: (page) => missingAltOf(page) !== undefined,
  run: ({ crawl }) =>
    crawl.pages.flatMap((page) => {
      const missing = missingAltOf(page);
      if (missing === undefined || missing.total === 0) return [];
      return [
        {
          checkId: 110,
          pageUrl: page.url,
          info: { total: missing.total, examples: [...missing.examples] },
        },
      ];
    }),
};
