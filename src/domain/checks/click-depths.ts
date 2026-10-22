import type { CrawlResult } from '../crawl.js';
import { normalizeUrl } from '../url.js';
import { finalRootUrl } from './final-root-url.js';
import { redirectTargetsOf, resolveRedirects } from './redirect-resolution.js';
import { internalLinks } from './site/internal-links.js';

/**
 * Minimum number of clicks from the final root to each reachable page, following `<a>` links only.
 * A redirecting link lands on its destination and costs a single click.
 */
export const clickDepths = (crawl: CrawlResult): ReadonlyMap<string, number> => {
  const redirectTargets = redirectTargetsOf(crawl);
  const destinationsBySource = new Map<string, string[]>();
  for (const link of internalLinks(crawl.links)) {
    const destination = resolveRedirects(normalizeUrl(link.targetUrl), redirectTargets);
    const destinations = destinationsBySource.get(link.sourceUrl) ?? [];
    destinations.push(destination);
    destinationsBySource.set(link.sourceUrl, destinations);
  }

  const root = finalRootUrl(crawl);
  const depths = new Map([[root, 0]]);
  const queue = [root];
  for (const url of queue) {
    const depth = depths.get(url) ?? 0;
    for (const destination of destinationsBySource.get(url) ?? []) {
      if (depths.has(destination)) continue;
      depths.set(destination, depth + 1);
      queue.push(destination);
    }
  }
  return depths;
};
