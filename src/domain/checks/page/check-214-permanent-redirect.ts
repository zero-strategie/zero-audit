import type { PageCheck } from '../../check.js';
import { hasHttpResponse } from './page-predicates.js';
import { PERMANENT_REDIRECT_STATUSES } from './redirect-statuses.js';

export const check214: PageCheck = {
  id: 214,
  severity: 'notice',
  theme: 'crawlability',
  scope: 'page',
  label: 'Page redirigée de façon définitive',
  applies: hasHttpResponse,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => page.status !== null && PERMANENT_REDIRECT_STATUSES.includes(page.status))
      .map((page) => ({
        checkId: 214,
        pageUrl: page.url,
        info: { status: page.status, target: page.redirectTarget },
      })),
};
