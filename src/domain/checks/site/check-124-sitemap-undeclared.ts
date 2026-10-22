import type { SiteCheck } from '../../check.js';

export const check124: SiteCheck = {
  id: 124,
  severity: 'warning',
  theme: 'crawlability',
  scope: 'site',
  label: 'Sitemap non déclaré dans robots.txt',
  run: ({ crawl }) => {
    if (!crawl.site.robotsFound || !crawl.site.sitemapFound) return [];
    const robots = crawl.siteFiles.find((file) => file.kind === 'robots');
    return robots?.facts?.['sitemapDeclarations'] === 0
      ? [{ checkId: 124, pageUrl: null, info: {} }]
      : [];
  },
};
