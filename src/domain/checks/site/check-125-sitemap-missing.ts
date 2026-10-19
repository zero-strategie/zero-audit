import type { SiteCheck } from '../../check.js';

export const check125: SiteCheck = {
  id: 125,
  severity: 'warning',
  theme: 'crawlability',
  scope: 'site',
  label: 'Aucun sitemap.xml détecté',
  run: ({ crawl }) => (crawl.site.sitemapFound ? [] : [{ checkId: 125, pageUrl: null, info: {} }]),
};
