import type { PageCheck } from '../../check.js';
import { LOW_WORD_COUNT } from '../../thresholds.js';
import { isHtml2xx } from './page-predicates.js';

export const check117: PageCheck = {
  id: 117,
  severity: 'warning',
  theme: 'content',
  scope: 'page',
  label: 'Page au contenu trop pauvre',
  applies: isHtml2xx,
  run: ({ crawl }) =>
    crawl.pages
      .filter(
        (page) => isHtml2xx(page) && page.wordCount !== null && page.wordCount < LOW_WORD_COUNT,
      )
      .map((page) => ({ checkId: 117, pageUrl: page.url, info: { wordCount: page.wordCount } })),
};
