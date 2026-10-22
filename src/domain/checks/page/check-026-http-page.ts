import type { PageCheck } from '../../check.js';
import { isHtml2xx } from './page-predicates.js';

const HTTP_PROTOCOL = 'http:';

export const check26: PageCheck = {
  id: 26,
  severity: 'error',
  theme: 'https',
  scope: 'page',
  label: 'Page servie en http',
  applies: isHtml2xx,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => isHtml2xx(page) && new URL(page.url).protocol === HTTP_PROTOCOL)
      .map((page) => ({ checkId: 26, pageUrl: page.url, info: {} })),
};
