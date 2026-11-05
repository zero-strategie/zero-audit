import type { PageCheck } from '../../check.js';
import { isSuccess } from './page-predicates.js';

export const check18: PageCheck = {
  id: 18,
  severity: 'error',
  theme: 'crawlability',
  scope: 'page',
  label: 'URL du sitemap en erreur ou redirigée',
  applies: (page) => page.inSitemap === true,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => page.inSitemap === true && !isSuccess(page))
      .map((page) => ({
        checkId: 18,
        pageUrl: page.url,
        info: { status: page.status, error: page.error },
      })),
};
