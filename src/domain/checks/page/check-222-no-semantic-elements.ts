import type { PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isHtml2xx } from './page-predicates.js';

/** `undefined` when the page cannot be judged (not HTML 2xx, no facts as in old snapshots). */
const semanticElementsOf = (page: Page): readonly unknown[] | undefined => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return undefined;
  const elements = page.htmlFacts['semanticElements'];
  return Array.isArray(elements) ? elements : undefined;
};

/** Any one of main, article, section, nav, header or footer is enough to give the page some structure. */
export const check222: PageCheck = {
  id: 222,
  severity: 'notice',
  theme: 'markup',
  scope: 'page',
  label: 'Aucun élément sémantique HTML5',
  applies: (page) => semanticElementsOf(page) !== undefined,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => semanticElementsOf(page)?.length === 0)
      .map((page) => ({ checkId: 222, pageUrl: page.url, info: {} })),
};
