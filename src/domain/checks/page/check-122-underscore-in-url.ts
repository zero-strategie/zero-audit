import type { PageCheck } from '../../check.js';

export const check122: PageCheck = {
  id: 122,
  severity: 'warning',
  theme: 'crawlability',
  scope: 'page',
  label: 'Tiret bas dans le chemin de l’URL',
  applies: () => true,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => new URL(page.url).pathname.includes('_'))
      .map((page) => ({ checkId: 122, pageUrl: page.url, info: {} })),
};
