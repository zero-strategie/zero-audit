import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { CrawlResult, Page } from '../../crawl.js';
import { normalizeUrl } from '../../url.js';
import { redirectTargetsOf, resolveRedirects } from '../redirect-resolution.js';
import { internalLinks } from '../site/internal-links.js';
import { isHtml2xx } from './page-predicates.js';

const isListedHtml2xx = (page: Page): boolean => page.inSitemap === true && isHtml2xx(page);

/** Destination URL -> pages that link to it, a redirecting link counting for its final destination. */
const linkingPagesByDestination = (crawl: CrawlResult): Map<string, Set<string>> => {
  const redirectTargets = redirectTargetsOf(crawl);
  const sources = new Map<string, Set<string>>();
  for (const link of internalLinks(crawl.links)) {
    const destination = resolveRedirects(normalizeUrl(link.targetUrl), redirectTargets);
    if (destination === link.sourceUrl) continue;
    const linking = sources.get(destination) ?? new Set<string>();
    linking.add(link.sourceUrl);
    sources.set(destination, linking);
  }
  return sources;
};

export const check207: PageCheck = {
  id: 207,
  severity: 'notice',
  theme: 'linking',
  scope: 'page',
  label: 'Page du sitemap qu’aucune autre page ne lie',
  applies: isListedHtml2xx,
  run: ({ crawl }) => {
    const sources = linkingPagesByDestination(crawl);
    const occurrences: IssueOccurrence[] = [];
    for (const page of crawl.pages) {
      if (!isListedHtml2xx(page) || sources.has(normalizeUrl(page.url))) continue;
      occurrences.push({ checkId: 207, pageUrl: page.url, info: {} });
    }
    return occurrences;
  },
};
