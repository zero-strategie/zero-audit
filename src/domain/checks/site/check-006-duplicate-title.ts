import type { PageCheck } from '../../check.js';
import { isHtml2xx } from '../page/page-predicates.js';
import { duplicateOccurrences } from './duplicates.js';

export const check6: PageCheck = {
  id: 6,
  severity: 'error',
  theme: 'markup',
  scope: 'page',
  label: 'Même titre utilisé sur plusieurs pages',
  applies: isHtml2xx,
  run: ({ crawl }) => duplicateOccurrences(6, crawl.pages.filter(isHtml2xx), (page) => page.title),
};
