import type { IssueOccurrence, PageCheck } from '../../check.js';
import type { CrawlResult, HostProbe, Page, SlashVariantProbe } from '../../crawl.js';
import { isHtml2xx } from '../page/page-predicates.js';

const TRAILING_SLASH = '/';
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;

const withTrailingSlash = (url: string): string | null => {
  const parsed = new URL(url);
  if (parsed.pathname.endsWith(TRAILING_SLASH)) return null;
  parsed.pathname += TRAILING_SLASH;
  return parsed.href;
};

const shareCanonical = (a: Page, b: Page): boolean =>
  a.canonical !== null && a.canonical === b.canonical;

const isHomePage = (page: Page, internalHost: string): boolean => {
  const { hostname, pathname, search } = new URL(page.url);
  return hostname === internalHost && pathname === TRAILING_SLASH && search === '';
};

const isHtml2xxProbe = (probe: HostProbe | SlashVariantProbe): boolean =>
  probe.isHtml &&
  probe.status !== null &&
  probe.status >= HTTP_OK_MIN &&
  probe.status <= HTTP_OK_MAX;

const hostOccurrences = ({ pages, internalHost, hostProbe }: CrawlResult): IssueOccurrence[] => {
  const home = pages.find((page) => isHomePage(page, internalHost));
  if (hostProbe === null || home === undefined || !isHtml2xxProbe(hostProbe)) return [];
  if (hostProbe.canonical !== null && hostProbe.canonical === home.canonical) return [];
  return [{ checkId: 1000, pageUrl: home.url, info: { variantUrl: hostProbe.url, kind: 'host' } }];
};

const probeOccurrences = ({ pages, slashProbes }: CrawlResult): IssueOccurrence[] => {
  const pagesByUrl = new Map(pages.map((page) => [page.url, page]));
  return slashProbes.flatMap((probe) => {
    const page = pagesByUrl.get(probe.sourcePageUrl);
    if (page === undefined || !isHtml2xxProbe(probe)) return [];
    if (probe.canonical !== null && probe.canonical === page.canonical) return [];
    return [
      { checkId: 1000, pageUrl: page.url, info: { variantUrl: probe.url, kind: 'trailing-slash' } },
    ];
  });
};

const slashOccurrences = ({ pages }: CrawlResult): IssueOccurrence[] => {
  const htmlPages = pages.filter(isHtml2xx);
  const pagesByUrl = new Map(htmlPages.map((page) => [page.url, page]));
  return htmlPages.flatMap((page) => {
    const variantUrl = withTrailingSlash(page.url);
    const variant = variantUrl === null ? undefined : pagesByUrl.get(variantUrl);
    if (variantUrl === null || variant === undefined || shareCanonical(page, variant)) return [];
    return [{ checkId: 1000, pageUrl: page.url, info: { variantUrl, kind: 'trailing-slash' } }];
  });
};

/** Custom check (ids 1000-1999 are reserved for checks absent from the Semrush catalogue). */
export const check1000: PageCheck = {
  id: 1000,
  severity: 'warning',
  theme: 'crawlability',
  scope: 'page',
  label: 'Même page accessible avec et sans slash final',
  applies: isHtml2xx,
  run: ({ crawl }) => [
    ...slashOccurrences(crawl),
    ...probeOccurrences(crawl),
    ...hostOccurrences(crawl),
  ],
};
