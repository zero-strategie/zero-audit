import type {
  IssueRow,
  OccurrencePage,
  ProjectOverview,
  Severity,
  SnapshotReport,
} from './types';

export interface ApiClient {
  listProjects(): Promise<ProjectOverview[]>;
  getSnapshotReport(snapshotId: string): Promise<SnapshotReport>;
  listIssues(snapshotId: string, severity?: Severity): Promise<IssueRow[]>;
  getOccurrences(snapshotId: string, checkId: number, page: number): Promise<OccurrencePage>;
}
