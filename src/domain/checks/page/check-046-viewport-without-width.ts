import type { PageCheck } from '../../check.js';
import { declaresWidth, hasViewportFacts, viewportOf } from './viewport-facts.js';

export const check46: PageCheck = {
  id: 46,
  severity: 'error',
  theme: 'on-page',
  scope: 'page',
  label: 'Viewport sans largeur définie',
  applies: hasViewportFacts,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => {
        const viewport = viewportOf(page);
        return typeof viewport === 'string' && !declaresWidth(viewport);
      })
      .map((page) => ({ checkId: 46, pageUrl: page.url, info: {} })),
};
