import type { CrawlResult } from '../crawl.js';
import { traceRedirects } from './page/redirect-trace.js';

export const redirectTargetsOf = (crawl: CrawlResult): ReadonlyMap<string, string> => {
  const targets = new Map<string, string>();
  for (const { url, redirectTarget } of crawl.pages) {
    if (redirectTarget !== null) targets.set(url, redirectTarget);
  }
  return targets;
};

/** Where a visitor lands after following the redirects of `url`; `url` itself when it does not redirect. */
export const resolveRedirects = (
  url: string,
  redirectTargets: ReadonlyMap<string, string>,
): string => traceRedirects(url, redirectTargets).chain.at(-1) ?? url;
