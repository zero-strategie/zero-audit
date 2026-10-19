export const PAGE_SORT_COLUMNS = ['url', 'status', 'depth', 'issues', 'responseTime'] as const;
export type PageSortColumn = (typeof PAGE_SORT_COLUMNS)[number];
export type PageSort = PageSortColumn | `-${PageSortColumn}`;

export const DEFAULT_PAGE_SORT: PageSort = 'url';

const DESCENDING_PREFIX = '-';

/** First click sorts ascending, the next one descending, then back to ascending. */
export const nextSort = (current: PageSort, column: PageSortColumn): PageSort =>
  current === column ? `-${column}` : column;

export type SortParam = { kind: 'valid'; sort: PageSort } | { kind: 'invalid'; raw: string };

export const parseSortParam = (raw: string | null): SortParam => {
  if (raw === null) return { kind: 'valid', sort: DEFAULT_PAGE_SORT };
  const column = raw.startsWith(DESCENDING_PREFIX) ? raw.slice(DESCENDING_PREFIX.length) : raw;
  const known = PAGE_SORT_COLUMNS.find((candidate) => candidate === column);
  if (!known) return { kind: 'invalid', raw };
  return { kind: 'valid', sort: raw.startsWith(DESCENDING_PREFIX) ? `-${known}` : known };
};
