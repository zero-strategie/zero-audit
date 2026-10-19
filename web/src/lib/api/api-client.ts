import type {
  Comparison,
  IssueRow,
  OccurrencePage,
  PageListing,
  ProjectOverview,
  Severity,
  SnapshotListing,
  SnapshotReport,
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
}
