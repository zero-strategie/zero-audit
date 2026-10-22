import type { CrawlResult } from '../crawl.js';
import { normalizeUrl } from '../url.js';
import { redirectTargetsOf, resolveRedirects } from './redirect-resolution.js';

/**
 * The page a visitor lands on from the start URL: where click depth is counted from.
 * The start URL is normalized because the CLI hands it over as typed, while pages and links are normalized.
 */
export const finalRootUrl = (crawl: CrawlResult): string =>
  resolveRedirects(normalizeUrl(crawl.rootUrl), redirectTargetsOf(crawl));
