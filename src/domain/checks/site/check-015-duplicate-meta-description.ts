import type { PageCheck } from '../../check.js';
import { isHtml2xx } from '../page/page-predicates.js';
import { duplicateOccurrences } from './duplicates.js';

export const check15: PageCheck = {
  id: 15,
  severity: 'error',
  theme: 'markup',
  scope: 'page',
  label: 'Même meta description sur plusieurs pages',
  applies: isHtml2xx,
  run: ({ crawl }) =>
    duplicateOccurrences(15, crawl.pages.filter(isHtml2xx), (page) => page.metaDescription),
};
