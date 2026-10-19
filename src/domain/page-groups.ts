import type { CheckResult } from './check.js';
import type { Page } from './crawl.js';
import { isHtml2xx } from './checks/page/page-predicates.js';

export const PAGE_GROUPS = ['healthy', 'have-issues', 'broken', 'redirect', 'blocked'] as const;
export type PageGroup = (typeof PAGE_GROUPS)[number];

export type GroupCounts = Readonly<Record<PageGroup, number>>;
export type GroupVariation = Readonly<Record<PageGroup, number | null>>;

export interface PageClassification {
  readonly groups: ReadonlyMap<string, PageGroup>;
  readonly counts: GroupCounts;
}

const HTTP_REDIRECT_MIN = 300;
const HTTP_REDIRECT_MAX = 399;
const HTTP_ERROR_MIN = 400;

const isBroken = ({ status }: Page): boolean => status === null || status >= HTTP_ERROR_MIN;

const isRedirect = ({ status }: Page): boolean =>
  status !== null && status >= HTTP_REDIRECT_MIN && status <= HTTP_REDIRECT_MAX;

/** Urls carrying at least one error or warning; notices and site-level occurrences are ignored. */
const flaggedUrls = (results: readonly CheckResult[]): Set<string> =>
  new Set(
    results
      .filter(({ severity }) => severity !== 'notice')
      .flatMap(({ occurrences }) => occurrences.map(({ pageUrl }) => pageUrl))
      .filter((url): url is string => url !== null),
  );

const groupOf = (page: Page, flagged: ReadonlySet<string>): PageGroup => {
  if (page.blockedByRobots) return 'blocked';
  if (isBroken(page)) return 'broken';
  if (isRedirect(page)) return 'redirect';
  return isHtml2xx(page) && flagged.has(page.url) ? 'have-issues' : 'healthy';
};

/** Priority: blocked, broken, redirect, have issues, healthy; one group per page. */
export const classifyPages = (
  pages: readonly Page[],
  results: readonly CheckResult[],
): PageClassification => {
  const flagged = flaggedUrls(results);
  const groups = new Map(pages.map((page) => [page.url, groupOf(page, flagged)]));
  const counts = Object.fromEntries(PAGE_GROUPS.map((group) => [group, 0])) as Record<
    PageGroup,
    number
  >;
  for (const group of groups.values()) counts[group] += 1;
  return { groups, counts };
};

export const groupVariation = (
  previous: GroupCounts | null,
  current: GroupCounts,
): GroupVariation =>
  Object.fromEntries(
    PAGE_GROUPS.map((group) => [
      group,
      previous === null ? null : current[group] - previous[group],
    ]),
  ) as GroupVariation;
