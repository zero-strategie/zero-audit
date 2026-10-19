import type { PageCheck } from '../../check.js';
import { isHtml2xx } from './page-predicates.js';

export const check104: PageCheck = {
  id: 104,
  severity: 'notice',
  theme: 'on-page',
  scope: 'page',
  label: 'Page avec plusieurs titres H1',
  applies: (page) => isHtml2xx(page) && page.h1.length > 0,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => isHtml2xx(page) && page.h1.length > 1)
      .map((page) => ({ checkId: 104, pageUrl: page.url, info: { h1Count: page.h1.length } })),
};
