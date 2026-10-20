import type { PageCheck } from '../../check.js';
import { LOW_TEXT_RATIO } from '../../thresholds.js';
import { isHtml2xx } from './page-predicates.js';

export const check112: PageCheck = {
  id: 112,
  severity: 'warning',
  theme: 'on-page',
  scope: 'page',
  label: 'Page trop chargée en balisage par rapport à son texte',
  applies: isHtml2xx,
  run: ({ crawl }) =>
    crawl.pages
      .filter(
        (page) => isHtml2xx(page) && page.textRatio !== null && page.textRatio < LOW_TEXT_RATIO,
      )
      .map((page) => ({ checkId: 112, pageUrl: page.url, info: { textRatio: page.textRatio } })),
};
