import type { PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isHtml2xx } from './page-predicates.js';

interface Refresh {
  readonly delaySeconds: number;
  readonly target: string | null;
}

const isRefresh = (value: unknown): value is Refresh =>
  typeof value === 'object' &&
  value !== null &&
  'delaySeconds' in value &&
  typeof value.delaySeconds === 'number' &&
  'target' in value &&
  (typeof value.target === 'string' || value.target === null);

/** `undefined` when the page cannot be judged; `null` when it has no meta refresh. */
const refreshOf = (page: Page): Refresh | null | undefined => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return undefined;
  const refresh = page.htmlFacts['metaRefresh'];
  if (refresh === null) return null;
  return isRefresh(refresh) ? refresh : undefined;
};

/** A refresh without a target only reloads the page: it redirects nowhere and is not reported. */
export const check40: PageCheck = {
  id: 40,
  severity: 'error',
  theme: 'crawlability',
  scope: 'page',
  label: 'Redirection par meta refresh',
  applies: (page) => refreshOf(page) !== undefined,
  run: ({ crawl }) =>
    crawl.pages.flatMap((page) => {
      const refresh = refreshOf(page);
      if (!refresh?.target) return [];
      return [
        {
          checkId: 40,
          pageUrl: page.url,
          info: { delaySeconds: refresh.delaySeconds, target: refresh.target },
        },
      ];
    }),
};
