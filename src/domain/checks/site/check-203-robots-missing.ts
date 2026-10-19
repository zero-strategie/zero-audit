import type { SiteCheck } from '../../check.js';

export const check203: SiteCheck = {
  id: 203,
  severity: 'notice',
  theme: 'crawlability',
  scope: 'site',
  label: 'Aucun fichier robots.txt détecté',
  run: ({ crawl }) => (crawl.site.robotsFound ? [] : [{ checkId: 203, pageUrl: null, info: {} }]),
};
