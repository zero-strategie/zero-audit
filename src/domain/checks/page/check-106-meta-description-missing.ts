import type { PageCheck } from '../../check.js';
import { isHtml2xx } from './page-predicates.js';

export const check106: PageCheck = {
  id: 106,
  severity: 'warning',
  theme: 'markup',
  scope: 'page',
  label: 'Page sans meta description',
  applies: isHtml2xx,
  run: ({ crawl }) =>
    crawl.pages
      .filter(
        (page) => isHtml2xx(page) && (page.metaDescription === null || page.metaDescription === ''),
      )
      .map((page) => ({ checkId: 106, pageUrl: page.url, info: {} })),
};
