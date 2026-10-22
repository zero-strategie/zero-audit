import type { PageCheck } from '../../check.js';
import { finalRootUrl } from '../final-root-url.js';

const HTTP_PREFIX = 'http:';
const HTTPS_PREFIX = 'https:';

export const check128: PageCheck = {
  id: 128,
  severity: 'warning',
  theme: 'https',
  scope: 'page',
  label: 'URL en http dans le sitemap d’un site https',
  applies: (page, { crawl }) =>
    page.inSitemap === true && finalRootUrl(crawl).startsWith(HTTPS_PREFIX),
  run: ({ crawl }) => {
    if (!finalRootUrl(crawl).startsWith(HTTPS_PREFIX)) return [];
    return crawl.pages
      .filter((page) => page.inSitemap === true && page.url.startsWith(HTTP_PREFIX))
      .map((page) => ({ checkId: 128, pageUrl: page.url, info: {} }));
  },
};
