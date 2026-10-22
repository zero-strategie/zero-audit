import type { PageCheck } from '../../check.js';
import { hasViewportFacts, viewportOf } from './viewport-facts.js';

export const check20: PageCheck = {
  id: 20,
  severity: 'error',
  theme: 'on-page',
  scope: 'page',
  label: 'Balise viewport absente',
  applies: hasViewportFacts,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => viewportOf(page) === null)
      .map((page) => ({ checkId: 20, pageUrl: page.url, info: {} })),
};
