// Response shapes of the zero-audit HTTP API (src/http). Duplicated on purpose: web/ never imports the core.
export type Theme = 'crawlability' | 'https' | 'linking' | 'on-page' | 'other';
export type PageGroup = 'healthy' | 'have-issues' | 'broken' | 'redirect' | 'blocked';
export type Severity = 'error' | 'warning' | 'notice';
export type SiteFileKind = 'robots' | 'sitemap' | 'llms';

export interface ProjectOverview {
  id: string;
  rootUrl: string;
  /** True for a project of the signed-in reader, false for a showcase project. */
  owned: boolean;
  createdAt: string;
  latestSnapshot: { id: string; finishedAt: string | null; health: number | null } | null;
  /** The most recent snapshot, whatever its status. */
  latestRun: { id: string; status: SnapshotStatus; startedAt: string } | null;
}

export type SnapshotStatus = 'queued' | 'running' | 'finished' | 'failed';

export interface StartedAudit {
  snapshotId: string;
  projectId: string;
}

export interface AuditProgress {
  status: SnapshotStatus;
  pagesCrawled: number;
  pagesLimit: number;
  startedAt: string;
  rootUrl: string;
  /** 1-based rank in the waiting line, `null` once the audit has been picked up. */
  queuePosition: number | null;
  /** Crawl attempts started so far: above 1, the audit is being resumed after an interruption. */
  attempts: number;
}

export interface Score {
  score: number | null;
  variation: number | null;
}

export interface SnapshotReport {
  snapshot: {
    id: string;
    projectId: string;
    rootUrl: string;
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
  status: SnapshotStatus;
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

export interface CurrentAccount {
  email: string;
  isAdmin: boolean;
  pagesLimitMax: number;
  /** `null` when the account has no quota (administrators). */
  auditsRemaining: number | null;
  nextAuditAt: string | null;
}
