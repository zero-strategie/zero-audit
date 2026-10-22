import type { IssueOccurrence, PageCheck } from '../../check.js';
import { URL_LENGTH_NOTICE } from '../../thresholds.js';

export const check201: PageCheck = {
  id: 201,
  severity: 'notice',
  theme: 'crawlability',
  scope: 'page',
  label: 'URL excessivement longue (au-delà de 200 caractères)',
  applies: () => true,
  run: ({ crawl }) => {
    const occurrences: IssueOccurrence[] = [];
    for (const page of crawl.pages) {
      const length = page.url.length;
      if (length <= URL_LENGTH_NOTICE) continue;
      occurrences.push({ checkId: 201, pageUrl: page.url, info: { length } });
    }
    return occurrences;
  },
};
