import type { PageCheck } from '../../check.js';
import { isHtml2xx } from './page-predicates.js';

export const check103: PageCheck = {
  id: 103,
  severity: 'warning',
  theme: 'markup',
  scope: 'page',
  label: 'Page sans titre H1',
  applies: isHtml2xx,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => isHtml2xx(page) && page.h1.length === 0)
      .map((page) => ({ checkId: 103, pageUrl: page.url, info: {} })),
};
