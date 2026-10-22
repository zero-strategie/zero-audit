import type { IssueOccurrence, PageCheck } from '../../check.js';
import { MAX_CLICK_DEPTH } from '../../thresholds.js';
import { clickDepths } from '../click-depths.js';
import { isHtml2xx } from './page-predicates.js';

export const check212: PageCheck = {
  id: 212,
  severity: 'notice',
  theme: 'crawlability',
  scope: 'page',
  label: 'Page à plus de 3 clics de l’accueil',
  applies: isHtml2xx,
  run: ({ crawl }) => {
    const depths = clickDepths(crawl);
    const occurrences: IssueOccurrence[] = [];
    for (const page of crawl.pages) {
      const clicks = depths.get(page.url);
      if (!isHtml2xx(page) || clicks === undefined || clicks <= MAX_CLICK_DEPTH) continue;
      occurrences.push({ checkId: 212, pageUrl: page.url, info: { clicks } });
    }
    return occurrences;
  },
};
