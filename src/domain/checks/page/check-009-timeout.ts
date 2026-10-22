import type { PageCheck } from '../../check.js';

export const check9: PageCheck = {
  id: 9,
  severity: 'error',
  theme: 'crawlability',
  scope: 'page',
  label: 'Page sans réponse dans le délai imparti',
  applies: () => true,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => page.error === 'timeout')
      .map((page) => ({ checkId: 9, pageUrl: page.url, info: {} })),
};
