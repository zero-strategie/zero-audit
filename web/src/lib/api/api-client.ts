import type {
  AuditProgress,
  Comparison,
  IssueRow,
  OccurrencePage,
  PageListing,
  ProjectOverview,
  Severity,
  SnapshotListing,
  SnapshotReport,
  StartedAudit,
} from './types';
import type { PageSort } from '../sorting';

export interface ApiClient {
  listProjects(): Promise<ProjectOverview[]>;
  getSnapshotReport(snapshotId: string): Promise<SnapshotReport>;
  listIssues(snapshotId: string, severity?: Severity): Promise<IssueRow[]>;
  getOccurrences(snapshotId: string, checkId: number, page: number): Promise<OccurrencePage>;
  listPages(snapshotId: string, page: number, sort: PageSort): Promise<PageListing>;
  listProjectSnapshots(projectId: string): Promise<SnapshotListing[]>;
  /** `baseId` is audit A, `targetId` audit B. */
  compare(baseId: string, targetId: string): Promise<Comparison>;
  /** Rejects with `InvalidRequest` (400) or `Conflict` (409), carrying the API message. */
  startAudit(input: { url: string; limit: number }): Promise<StartedAudit>;
  getAuditProgress(snapshotId: string): Promise<AuditProgress>;
  /** True only when the API answers `/health` with 200 in time; never throws. */
  checkHealth(): Promise<boolean>;
}
