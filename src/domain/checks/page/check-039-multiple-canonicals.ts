import type { PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isHtml2xx } from './page-predicates.js';

interface CanonicalFacts {
  readonly count: number;
  readonly urls: readonly string[];
}

/** `undefined` when the page cannot be judged (not HTML 2xx, no facts as in old snapshots). */
const canonicalsOf = (page: Page): CanonicalFacts | undefined => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return undefined;
  const count = page.htmlFacts['canonicalCount'];
  const urls = page.htmlFacts['canonicalUrls'];
  if (typeof count !== 'number' || !Array.isArray(urls)) return undefined;
  return { count, urls: urls.filter((url): url is string => typeof url === 'string') };
};

/** Two canonicals are ambiguous even when identical: engines may ignore both. */
export const check39: PageCheck = {
  id: 39,
  severity: 'error',
  theme: 'crawlability',
  scope: 'page',
  label: 'Plusieurs balises canonical',
  applies: (page) => canonicalsOf(page) !== undefined,
  run: ({ crawl }) =>
    crawl.pages.flatMap((page) => {
      const canonicals = canonicalsOf(page);
      if (canonicals === undefined || canonicals.count < 2) return [];
      return [{ checkId: 39, pageUrl: page.url, info: { urls: [...canonicals.urls] } }];
    }),
};
