import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { normalizeUrl } from '../../url.js';
import { internalLinks } from './internal-links.js';

const HTTP_CLIENT_ERROR_MIN = 400;

const isFailed = (page: Page): boolean =>
  page.status === null ? page.error !== null : page.status >= HTTP_CLIENT_ERROR_MIN;

export const check8: PageCheck = {
  id: 8,
  severity: 'error',
  theme: 'linking',
  scope: 'page',
  label: 'Lien interne vers une page en échec',
  applies: (page, { crawl }) =>
    internalLinks(crawl.links).some((link) => link.sourceUrl === page.url),
  run: ({ crawl }) => {
    const pagesByUrl = new Map(crawl.pages.map((page) => [page.url, page]));
    const seen = new Set<string>();
    const occurrences: IssueOccurrence[] = [];
    for (const link of internalLinks(crawl.links)) {
      const targetUrl = normalizeUrl(link.targetUrl);
      const key = `${link.sourceUrl}\n${targetUrl}`;
      const target = pagesByUrl.get(targetUrl);
      if (seen.has(key) || target === undefined || !isFailed(target)) continue;
      seen.add(key);
      occurrences.push({
        checkId: 8,
        pageUrl: link.sourceUrl,
        info: { targetUrl, status: target.status, error: target.error },
      });
    }
    return occurrences;
  },
};
