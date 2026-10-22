import type { Page } from '../../crawl.js';
import type { PageCheck } from '../../check.js';
import { isHtml2xx } from './page-predicates.js';

const COMPRESSION_CODINGS: ReadonlySet<string> = new Set(['gzip', 'br', 'zstd', 'deflate']);

const isCompressed = (page: Page): boolean =>
  (page.headers['content-encoding'] ?? '')
    .split(',')
    .some((coding) => COMPRESSION_CODINGS.has(coding.trim().toLowerCase()));

export const check129: PageCheck = {
  id: 129,
  severity: 'warning',
  theme: 'other',
  scope: 'page',
  label: 'Page HTML servie sans compression',
  applies: isHtml2xx,
  run: ({ crawl }) =>
    crawl.pages
      .filter((page) => isHtml2xx(page) && !isCompressed(page))
      .map((page) => ({ checkId: 129, pageUrl: page.url, info: {} })),
};
