// Response shapes of the zero-audit HTTP API (src/http). Duplicated on purpose: web/ never imports the core.
export type Theme = 'crawlability' | 'https' | 'linking' | 'on-page' | 'other';
export type PageGroup = 'healthy' | 'have-issues' | 'broken' | 'redirect' | 'blocked';
export type Severity = 'error' | 'warning' | 'notice';
export type SiteFileKind = 'robots' | 'sitemap' | 'llms';

export interface ProjectOverview {
  id: string;
  rootUrl: string;
  createdAt: string;
  latestSnapshot: { id: string; finishedAt: string | null; health: number | null } | null;
}

export interface Score {
  score: number | null;
  variation: number | null;
}

export interface SnapshotReport {
  snapshot: {
    id: string;
    projectId: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    pagesCrawled: number;
    pagesLimit: number;
  };
  health: Score;
  themes: Record<Theme, Score>;
  counts: { errors: number; warnings: number; notices: number };
  pageGroups: Record<PageGroup, { count: number; variation: number | null }>;
  siteFiles: {
    kind: SiteFileKind;
    url: string;
    status: number | null;
    error: string | null;
  }[];
  topIssues: {
    checkId: number;
    label: string;
    severity: Severity;
    theme: Theme;
    count: number;
    delta: number;
  }[];
}

export interface IssueRow {
  checkId: number;
  label: string;
  severity: Severity;
  theme: Theme;
  count: number;
  examined: number;
  delta: number;
  newCount: number;
  fixedCount: number;
}

export interface OccurrencePage {
  items: { pageUrl: string | null; info: Record<string, unknown> }[];
  total: number;
  page: number;
  limit: number;
}

export interface PageRow {
  url: string;
  status: number | null;
  depth: number;
  group: PageGroup;
  canonical: string | null;
  issues: number;
  responseTimeMs: number;
}

export interface PageListing {
  items: PageRow[];
  total: number;
  page: number;
  limit: number;
}

export interface SnapshotListing {
  id: string;
  status: 'running' | 'finished' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  pagesCrawled: number;
  health: number | null;
}

export interface CheckComparison {
  checkId: number;
  label: string;
  severity: Severity | null;
  theme: Theme | null;
  countA: number;
  countB: number;
  delta: number;
  newCount: number;
  fixedCount: number;
}

export interface Comparison {
  base: { id: string };
  target: { id: string };
  health: Score;
  themes: Record<Theme, Score>;
  checks: CheckComparison[];
}
