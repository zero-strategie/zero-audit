import type { PageCheck } from '../../check.js';
import type { Page } from '../../crawl.js';
import { isHtml2xx } from '../page/page-predicates.js';

const TRAILING_SLASH = '/';

const withTrailingSlash = (url: string): string | null => {
  const parsed = new URL(url);
  if (parsed.pathname.endsWith(TRAILING_SLASH)) return null;
  parsed.pathname += TRAILING_SLASH;
  return parsed.href;
};

const shareCanonical = (a: Page, b: Page): boolean =>
  a.canonical !== null && a.canonical === b.canonical;

/** Custom check (ids 1000-1999 are reserved for checks absent from the Semrush catalogue). */
export const check1000: PageCheck = {
  id: 1000,
  severity: 'warning',
  theme: 'crawlability',
  scope: 'page',
  label: 'Même page accessible avec et sans slash final',
  applies: isHtml2xx,
  run: ({ crawl }) => {
    const pages = crawl.pages.filter(isHtml2xx);
    const pagesByUrl = new Map(pages.map((page) => [page.url, page]));
    return pages.flatMap((page) => {
      const variantUrl = withTrailingSlash(page.url);
      const variant = variantUrl === null ? undefined : pagesByUrl.get(variantUrl);
      if (variantUrl === null || variant === undefined || shareCanonical(page, variant)) return [];
      return [
        {
          checkId: 1000,
          pageUrl: page.url,
          info: { variantUrl, kind: 'trailing-slash' },
        },
      ];
    });
  },
};
