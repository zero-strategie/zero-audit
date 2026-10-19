import type { PageCheck } from '../../check.js';
import { TITLE_MAX_LENGTH } from '../../thresholds.js';
import { isHtml2xx } from './page-predicates.js';

export const check102: PageCheck = {
  id: 102,
  severity: 'warning',
  theme: 'markup',
  scope: 'page',
  label: 'Titre de page trop long',
  applies: isHtml2xx,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => isHtml2xx(page) && page.title && page.title.length > TITLE_MAX_LENGTH)
      .map((page) => ({ checkId: 102, pageUrl: page.url, info: { length: page.title?.length } })),
};
