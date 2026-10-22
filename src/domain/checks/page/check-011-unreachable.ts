import type { PageCheck } from '../../check.js';

export const check11: PageCheck = {
  id: 11,
  severity: 'error',
  theme: 'crawlability',
  scope: 'page',
  label: 'Page injoignable',
  applies: () => true,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => page.error !== null && page.error !== 'timeout')
      .map((page) => ({ checkId: 11, pageUrl: page.url, info: { kind: page.error } })),
};
