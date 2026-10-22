import type { CrawlResult } from '../crawl.js';
import { redirectTargetsOf, resolveRedirects } from './redirect-resolution.js';

/** The page a visitor lands on from the start URL: where click depth is counted from. */
export const finalRootUrl = (crawl: CrawlResult): string =>
  resolveRedirects(crawl.rootUrl, redirectTargetsOf(crawl));
