import type { ApiClient } from '../src/lib/api/api-client';
import type { IssueRow, PageRow, ProjectOverview, SnapshotReport } from '../src/lib/api/types';

const unexpected = (): never => {
  throw new Error('unexpected call on fake client');
};

export const fakeApiClient = (overrides: Partial<ApiClient>): ApiClient => ({
  listProjects: unexpected,
  getSnapshotReport: unexpected,
  listIssues: unexpected,
  getOccurrences: unexpected,
  listPages: unexpected,
  listProjectSnapshots: unexpected,
  compare: unexpected,
  ...overrides,
});

export const aProject = (overrides: Partial<ProjectOverview> = {}): ProjectOverview => ({
  id: 'p1',
  rootUrl: 'https://alpha.test/',
  createdAt: '2026-01-01T00:00:00.000Z',
  latestSnapshot: { id: 's1', finishedAt: '2026-03-05T10:00:00.000Z', health: 82 },
  ...overrides,
});

export const aReport = (overrides: Partial<SnapshotReport> = {}): SnapshotReport => ({
  snapshot: {
    id: 's1',
    projectId: 'p1',
    status: 'finished',
    startedAt: '2026-03-05T09:00:00.000Z',
    finishedAt: '2026-03-05T10:00:00.000Z',
    pagesCrawled: 40,
    pagesLimit: 100,
  },
  health: { score: 82, variation: 2 },
  themes: {
    crawlability: { score: 90, variation: 1 },
    https: { score: null, variation: null },
    linking: { score: 70, variation: -4 },
    'on-page': { score: 60, variation: 0 },
    other: { score: 95, variation: null },
  },
  counts: { errors: 11, warnings: 22, notices: 33 },
  pageGroups: {
    healthy: { count: 20, variation: 3 },
    'have-issues': { count: 10, variation: -1 },
    broken: { count: 4, variation: null },
    redirect: { count: 5, variation: 0 },
    blocked: { count: 1, variation: 2 },
  },
  siteFiles: [
    { kind: 'robots', url: 'https://alpha.test/robots.txt', status: 200, error: null },
    { kind: 'sitemap', url: 'https://alpha.test/sitemap.xml', status: 404, error: null },
    { kind: 'llms', url: 'https://alpha.test/llms.txt', status: null, error: 'timeout' },
  ],
  topIssues: [
    {
      checkId: 15,
      label: 'Même meta description sur plusieurs pages',
      severity: 'warning',
      theme: 'on-page',
      count: 7,
      delta: 1,
    },
  ],
  ...overrides,
});

export const anIssue = (overrides: Partial<IssueRow> = {}): IssueRow => ({
  checkId: 15,
  label: 'Même meta description sur plusieurs pages',
  severity: 'warning',
  theme: 'on-page',
  count: 7,
  examined: 40,
  delta: 2,
  newCount: 3,
  fixedCount: 1,
  ...overrides,
});

export const aPageRow = (overrides: Partial<PageRow> = {}): PageRow => ({
  url: 'https://alpha.test/',
  status: 200,
  depth: 0,
  group: 'healthy',
  canonical: null,
  issues: 0,
  responseTimeMs: 120,
  ...overrides,
});
