import type { PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isHtml2xx } from './page-predicates.js';

/** `undefined` when the page cannot be judged (not HTML 2xx, no facts as in old snapshots). */
const hasDoctype = (page: Page): boolean | undefined => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return undefined;
  const declared = page.htmlFacts['hasDoctype'];
  return typeof declared === 'boolean' ? declared : undefined;
};

export const check116: PageCheck = {
  id: 116,
  severity: 'warning',
  theme: 'on-page',
  scope: 'page',
  label: 'Page sans doctype',
  applies: (page) => hasDoctype(page) !== undefined,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => hasDoctype(page) === false)
      .map((page) => ({ checkId: 116, pageUrl: page.url, info: {} })),
};
