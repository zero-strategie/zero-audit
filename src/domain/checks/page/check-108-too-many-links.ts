import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { Link } from '../../crawl.js';
import { MAX_LINKS_PER_PAGE } from '../../thresholds.js';
import { isHtml2xx } from './page-predicates.js';

const isCountedLink = (link: Link): boolean => link.type !== 'resource';

const countLinksBySource = (links: readonly Link[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const link of links) {
    if (!isCountedLink(link)) continue;
    counts.set(link.sourceUrl, (counts.get(link.sourceUrl) ?? 0) + 1);
  }
  return counts;
};

export const check108: PageCheck = {
  id: 108,
  severity: 'warning',
  theme: 'linking',
  scope: 'page',
  label: 'Page contenant trop de liens',
  applies: isHtml2xx,
  run: ({ crawl }) => {
    const counts = countLinksBySource(crawl.links);
    const occurrences: IssueOccurrence[] = [];
    for (const page of crawl.pages) {
      const count = counts.get(page.url) ?? 0;
      if (!isHtml2xx(page) || count <= MAX_LINKS_PER_PAGE) continue;
      occurrences.push({ checkId: 108, pageUrl: page.url, info: { count } });
    }
    return occurrences;
  },
};
