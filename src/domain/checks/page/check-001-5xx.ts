import type { PageCheck } from '../../check.js';
import { hasHttpResponse } from './page-predicates.js';

const SERVER_ERROR_MIN = 500;
const SERVER_ERROR_MAX = 599;

export const check1: PageCheck = {
  id: 1,
  severity: 'error',
  theme: 'status',
  scope: 'page',
  label: 'Page en erreur serveur (5xx)',
  applies: hasHttpResponse,
  run: ({ crawl }) =>
    crawl.pages
      .filter(
        (page) =>
          page.status !== null &&
          page.status >= SERVER_ERROR_MIN &&
          page.status <= SERVER_ERROR_MAX,
      )
      .map((page) => ({ checkId: 1, pageUrl: page.url, info: { status: page.status } })),
};
