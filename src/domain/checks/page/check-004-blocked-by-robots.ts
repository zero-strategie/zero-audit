import type { PageCheck } from '../../check.js';

export const check4: PageCheck = {
  id: 4,
  severity: 'notice',
  theme: 'crawlability',
  scope: 'page',
  label: 'Page bloquée par robots.txt',
  applies: () => true,
  run: ({ crawl }) =>
    crawl.blockedPages.map((page) => ({ checkId: 4, pageUrl: page.url, info: {} })),
};
