import type { PageCheck } from '../../check.js';
import { isHtml2xx } from './page-predicates.js';

export const check3: PageCheck = {
  id: 3,
  severity: 'error',
  theme: 'markup',
  scope: 'page',
  label: 'Page sans balise title',
  applies: isHtml2xx,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => isHtml2xx(page) && (page.title === null || page.title === ''))
      .map((page) => ({ checkId: 3, pageUrl: page.url, info: {} })),
};
