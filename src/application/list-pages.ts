import { SnapshotNotFound } from '../domain/errors.js';
import { classifyPages, type PageGroup } from '../domain/page-groups.js';
import { paginate, type Paginated, type PageRequest } from '../domain/pagination.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';

export const PAGE_SORT_FIELDS = ['url', 'status', 'depth', 'issues', 'responseTime'] as const;
export type PageSortField = (typeof PAGE_SORT_FIELDS)[number];
export type PageSort = PageSortField | `-${PageSortField}`;
export const PAGE_SORTS: readonly PageSort[] = PAGE_SORT_FIELDS.flatMap((field) => [
  field,
  `-${field}` as const,
]);

export interface PageRow {
  readonly url: string;
  readonly status: number | null;
  readonly depth: number;
  readonly group: PageGroup;
  readonly canonical: string | null;
  readonly issues: number;
  readonly responseTimeMs: number;
}

const SORT_KEYS: Readonly<Record<PageSortField, (row: PageRow) => number | string>> = {
  url: (row) => row.url,
  status: (row) => row.status ?? 0,
  depth: (row) => row.depth,
  issues: (row) => row.issues,
  responseTime: (row) => row.responseTimeMs,
};

const compare = (a: number | string, b: number | string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Ties are broken by url so that the order, and therefore the pagination, is stable. */
export const sortPages = (rows: readonly PageRow[], sort: PageSort): PageRow[] => {
  const descending = sort.startsWith('-');
  const key = SORT_KEYS[(descending ? sort.slice(1) : sort) as PageSortField];
  const direction = descending ? -1 : 1;
  return [...rows].sort((a, b) => direction * compare(key(a), key(b)) || compare(a.url, b.url));
};

export class ListPages {
  constructor(private readonly repository: SnapshotRepository) {}

  async execute(
    snapshotId: string,
    { sort, page, limit }: PageRequest & { sort: PageSort },
  ): Promise<Paginated<PageRow>> {
    const details = await this.repository.getById(snapshotId);
    if (!details) throw new SnapshotNotFound(snapshotId);
    const { groups } = classifyPages(details.pages, details.checkResults);
    const issuesByUrl = new Map<string, number>();
    for (const { pageUrl } of details.checkResults.flatMap(({ occurrences }) => occurrences)) {
      if (pageUrl !== null) issuesByUrl.set(pageUrl, (issuesByUrl.get(pageUrl) ?? 0) + 1);
    }
    const rows = details.pages.map((p): PageRow => ({
      url: p.url,
      status: p.status,
      depth: p.depth,
      group: groups.get(p.url) ?? 'healthy',
      canonical: p.canonical,
      issues: issuesByUrl.get(p.url) ?? 0,
      responseTimeMs: p.responseTimeMs,
    }));
    return paginate(sortPages(rows, sort), { page, limit });
  }
}
