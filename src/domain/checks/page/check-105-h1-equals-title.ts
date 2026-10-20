import type { Page } from '../../crawl.js';
import type { PageCheck } from '../../check.js';
import { normalizeForComparison } from '../../normalize-for-comparison.js';
import { isHtml2xx } from './page-predicates.js';

const hasH1EqualToTitle = (page: Page): boolean => {
  if (page.title === null) return false;
  const title = normalizeForComparison(page.title);
  return page.h1.some((h1) => normalizeForComparison(h1) === title);
};

export const check105: PageCheck = {
  id: 105,
  severity: 'warning',
  theme: 'on-page',
  scope: 'page',
  label: 'H1 identique à la balise title',
  applies: isHtml2xx,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => isHtml2xx(page) && hasH1EqualToTitle(page))
      .map((page) => ({ checkId: 105, pageUrl: page.url, info: {} })),
};
