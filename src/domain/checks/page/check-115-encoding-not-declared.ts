import type { PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isHtml2xx } from './page-predicates.js';

const CHARSET_IN_CONTENT_TYPE = /charset\s*=/i;

const hasFacts = (page: Page): boolean => isHtml2xx(page) && page.htmlFacts !== null;

const declaresCharset = (page: Page): boolean => {
  if (CHARSET_IN_CONTENT_TYPE.test(page.contentType ?? '')) return true;
  const charset = page.htmlFacts?.['charset'];
  return typeof charset === 'string' && charset !== '';
};

export const check115: PageCheck = {
  id: 115,
  severity: 'warning',
  theme: 'on-page',
  scope: 'page',
  label: 'Aucun jeu de caractères déclaré',
  applies: hasFacts,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => hasFacts(page) && !declaresCharset(page))
      .map((page) => ({ checkId: 115, pageUrl: page.url, info: {} })),
};
