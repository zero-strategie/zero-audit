import type { Page } from '../../crawl.js';
import { isHtml2xx } from './page-predicates.js';

const WIDTH_DIRECTIVE = /(?:^|[,;\s])width\s*=/i;

/**
 * The viewport meta content of an HTML 2xx page: `null` when the page has none,
 * `undefined` when the page cannot be judged (no facts, as in old snapshots).
 */
export const viewportOf = (page: Page): string | null | undefined => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return undefined;
  const viewport = page.htmlFacts['viewport'];
  return typeof viewport === 'string' || viewport === null ? viewport : undefined;
};

export const hasViewportFacts = (page: Page): boolean => viewportOf(page) !== undefined;

export const declaresWidth = (viewport: string): boolean => WIDTH_DIRECTIVE.test(viewport);
