import type { PageCheck } from '../../check.js';
import { TITLE_MIN_LENGTH } from '../../thresholds.js';
import { isHtml2xx } from './page-predicates.js';

export const check101: PageCheck = {
  id: 101,
  severity: 'warning',
  theme: 'on-page',
  scope: 'page',
  label: 'Titre de page trop court',
  applies: isHtml2xx,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => isHtml2xx(page) && page.title && page.title.length < TITLE_MIN_LENGTH)
      .map((page) => ({ checkId: 101, pageUrl: page.url, info: { length: page.title?.length } })),
};
