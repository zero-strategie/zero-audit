import type { PageCheck } from '../../check.js';
import { TOO_MUCH_CONTENT_WORDS } from '../../thresholds.js';
import { isHtml2xx } from './page-predicates.js';

export const check220: PageCheck = {
  id: 220,
  severity: 'notice',
  theme: 'on-page',
  scope: 'page',
  label: 'Page au contenu démesuré',
  applies: (page) => isHtml2xx(page) && page.wordCount !== null,
  run: ({ crawl }) =>
    crawl.pages.flatMap((page) =>
      isHtml2xx(page) && page.wordCount !== null && page.wordCount > TOO_MUCH_CONTENT_WORDS
        ? [{ checkId: 220, pageUrl: page.url, info: { words: page.wordCount } }]
        : [],
    ),
};
