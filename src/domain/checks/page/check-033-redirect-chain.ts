import type { IssueOccurrence, PageCheck } from '../../check.js';
import { MIN_REDIRECT_CHAIN_HOPS } from '../../thresholds.js';
import { traceRedirects } from './redirect-trace.js';
import { PERMANENT_REDIRECT_STATUSES, TEMPORARY_REDIRECT_STATUSES } from './redirect-statuses.js';

const isRedirect = (status: number | null): boolean =>
  status !== null &&
  (TEMPORARY_REDIRECT_STATUSES.includes(status) || PERMANENT_REDIRECT_STATUSES.includes(status));

export const check33: PageCheck = {
  id: 33,
  severity: 'error',
  theme: 'crawlability',
  scope: 'page',
  label: 'Chaîne ou boucle de redirections',
  applies: (page) => isRedirect(page.status),
  run: ({ crawl }) => {
    const targets = new Map<string, string>();
    for (const { url, redirectTarget } of crawl.pages) {
      if (redirectTarget !== null) targets.set(url, redirectTarget);
    }
    const occurrences: IssueOccurrence[] = [];
    for (const page of crawl.pages) {
      if (!isRedirect(page.status)) continue;
      const { chain, loop, truncated } = traceRedirects(page.url, targets);
      if (!loop && chain.length < MIN_REDIRECT_CHAIN_HOPS) continue;
      occurrences.push({
        checkId: 33,
        pageUrl: page.url,
        info: truncated ? { chain, loop, truncated } : { chain, loop },
      });
    }
    return occurrences;
  },
};
