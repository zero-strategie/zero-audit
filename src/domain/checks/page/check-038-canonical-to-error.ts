import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { normalizeUrl } from '../../url.js';
import { isHtml2xx } from './page-predicates.js';

const HTTP_ERROR_MIN = 400;

const isErrorPage = (page: Page): boolean =>
  page.status === null ? page.error !== null : page.status >= HTTP_ERROR_MIN;

export const check38: PageCheck = {
  id: 38,
  severity: 'error',
  theme: 'crawlability',
  scope: 'page',
  label: 'Canonical pointant vers une page en erreur',
  applies: (page) => isHtml2xx(page) && page.canonical !== null,
  run: ({ crawl }) => {
    const pagesByUrl = new Map(crawl.pages.map((page) => [page.url, page]));
    const occurrences: IssueOccurrence[] = [];
    for (const page of crawl.pages) {
      if (!isHtml2xx(page) || page.canonical === null) continue;
      const target = pagesByUrl.get(normalizeUrl(page.canonical));
      if (target === undefined || !isErrorPage(target)) continue;
      occurrences.push({
        checkId: 38,
        pageUrl: page.url,
        info: { canonical: page.canonical, status: target.status },
      });
    }
    return occurrences;
  },
};
