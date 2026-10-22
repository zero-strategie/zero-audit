import type { PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { MAX_HTML_BYTES } from '../../thresholds.js';
import { isHtml2xx } from './page-predicates.js';

/** `undefined` when the page cannot be judged (not HTML 2xx, no facts as in old snapshots). */
const htmlBytesOf = (page: Page): number | undefined => {
  if (!isHtml2xx(page) || page.htmlFacts === null) return undefined;
  const bytes = page.htmlFacts['htmlBytes'];
  return typeof bytes === 'number' ? bytes : undefined;
};

export const check21: PageCheck = {
  id: 21,
  severity: 'error',
  theme: 'other',
  scope: 'page',
  label: 'Document HTML trop lourd',
  applies: (page) => htmlBytesOf(page) !== undefined,
  run: ({ crawl }) =>
    crawl.pages.flatMap((page) => {
      const bytes = htmlBytesOf(page);
      return bytes !== undefined && bytes > MAX_HTML_BYTES
        ? [{ checkId: 21, pageUrl: page.url, info: { bytes } }]
        : [];
    }),
};
