import type { PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isHtml2xx } from './page-predicates.js';

const HTTPS_PREFIX = 'https:';

interface InsecureResources {
  readonly total: number;
  readonly examples: readonly unknown[];
}

const isInsecureResources = (value: unknown): value is InsecureResources =>
  typeof value === 'object' &&
  value !== null &&
  'total' in value &&
  typeof value.total === 'number' &&
  'examples' in value &&
  Array.isArray(value.examples);

/** `undefined` when the page cannot be judged (not an https HTML 2xx page, no facts as in old snapshots). */
const insecureResourcesOf = (page: Page): InsecureResources | undefined => {
  if (!page.url.startsWith(HTTPS_PREFIX) || !isHtml2xx(page) || page.htmlFacts === null) {
    return undefined;
  }
  const facts = page.htmlFacts['insecureResources'];
  return isInsecureResources(facts) ? facts : undefined;
};

/** Resources are read from the markup only and never requested; `<a>` links belong to check 31. */
export const check30: PageCheck = {
  id: 30,
  severity: 'error',
  theme: 'https',
  scope: 'page',
  label: 'Contenu mixte : ressources http sur une page https',
  applies: (page) => insecureResourcesOf(page) !== undefined,
  run: ({ crawl }) =>
    crawl.pages.flatMap((page) => {
      const insecure = insecureResourcesOf(page);
      if (insecure === undefined || insecure.total === 0) return [];
      return [
        {
          checkId: 30,
          pageUrl: page.url,
          info: { total: insecure.total, urls: [...insecure.examples] },
        },
      ];
    }),
};
