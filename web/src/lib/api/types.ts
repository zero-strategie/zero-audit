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
