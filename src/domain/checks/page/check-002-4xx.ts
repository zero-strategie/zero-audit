import type { PageCheck } from '../../check.js';
import { hasHttpResponse } from './page-predicates.js';

const CLIENT_ERROR_MIN = 400;
const CLIENT_ERROR_MAX = 499;

export const check2: PageCheck = {
  id: 2,
  severity: 'error',
  theme: 'status',
  scope: 'page',
  label: 'Page introuvable ou refusée (4xx)',
  applies: hasHttpResponse,
  run: ({ crawl }) =>
    crawl.pages
      .filter(
        (page) =>
          page.status !== null &&
          page.status >= CLIENT_ERROR_MIN &&
          page.status <= CLIENT_ERROR_MAX,
      )
      .map((page) => ({ checkId: 2, pageUrl: page.url, info: { status: page.status } })),
};
