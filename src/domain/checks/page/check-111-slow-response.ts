import type { PageCheck } from '../../check.js';
import { SLOW_RESPONSE_MS } from '../../thresholds.js';
import { isHtml2xx } from './page-predicates.js';

export const check111: PageCheck = {
  id: 111,
  severity: 'error',
  theme: 'other',
  scope: 'page',
  label: 'Page lente à répondre',
  applies: isHtml2xx,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => isHtml2xx(page) && page.responseTimeMs > SLOW_RESPONSE_MS)
      .map((page) => ({
        checkId: 111,
        pageUrl: page.url,
        info: { responseTimeMs: page.responseTimeMs },
      })),
};
