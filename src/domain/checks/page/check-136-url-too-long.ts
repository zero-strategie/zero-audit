import type { IssueOccurrence, PageCheck } from '../../check.js';
import { URL_LENGTH_NOTICE, URL_LENGTH_WARNING } from '../../thresholds.js';

export const check136: PageCheck = {
  id: 136,
  severity: 'warning',
  theme: 'crawlability',
  scope: 'page',
  label: 'URL trop longue',
  applies: () => true,
  run: ({ crawl }) => {
    const occurrences: IssueOccurrence[] = [];
    for (const page of crawl.pages) {
      const length = page.url.length;
      if (length <= URL_LENGTH_WARNING || length > URL_LENGTH_NOTICE) continue;
      occurrences.push({ checkId: 136, pageUrl: page.url, info: { length } });
    }
    return occurrences;
  },
};
