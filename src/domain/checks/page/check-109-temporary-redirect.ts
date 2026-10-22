import type { PageCheck } from '../../check.js';
import { hasHttpResponse } from './page-predicates.js';
import { TEMPORARY_REDIRECT_STATUSES } from './redirect-statuses.js';

export const check109: PageCheck = {
  id: 109,
  severity: 'warning',
  theme: 'crawlability',
  scope: 'page',
  label: 'Page redirigée de façon temporaire',
  applies: hasHttpResponse,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => page.status !== null && TEMPORARY_REDIRECT_STATUSES.includes(page.status))
      .map((page) => ({
        checkId: 109,
        pageUrl: page.url,
        info: { status: page.status, target: page.redirectTarget },
      })),
};
