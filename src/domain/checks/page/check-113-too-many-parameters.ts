import type { IssueOccurrence, PageCheck } from '../../check.js';
import { MAX_QUERY_PARAMETERS } from '../../thresholds.js';

const countQueryParameters = (url: string): number => [...new URL(url).searchParams].length;

export const check113: PageCheck = {
  id: 113,
  severity: 'warning',
  theme: 'crawlability',
  scope: 'page',
  label: 'URL avec trop de paramètres de requête',
  applies: () => true,
  run: ({ crawl }) => {
    const occurrences: IssueOccurrence[] = [];
    for (const page of crawl.pages) {
      const count = countQueryParameters(page.url);
      if (count <= MAX_QUERY_PARAMETERS) continue;
      occurrences.push({ checkId: 113, pageUrl: page.url, info: { count } });
    }
    return occurrences;
  },
};
