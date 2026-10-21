import type {
  AuditProgress,
  Comparison,
  CurrentAccount,
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

  /**
   * Account calls reject with `InvalidRequest` (400), `Unauthenticated` (401), `Forbidden` (403),
   * `Conflict` (409), `TooManyRequests` (429) or `ServiceUnavailable` (503), carrying the API message.
   * The ones answering 202 return the API's generic message.
   */
  register(input: { email: string; password: string; website: string }): Promise<string>;
  resendVerification(email: string): Promise<string>;
  /** Returns the id of the session opened by the confirmation. */
  verifyEmail(token: string): Promise<string>;
  /** Returns the id of the new session. */
  login(input: { email: string; password: string }): Promise<string>;
  logout(): Promise<void>;
  getCurrentAccount(): Promise<CurrentAccount>;
  requestPasswordReset(email: string): Promise<string>;
  confirmPasswordReset(input: { token: string; password: string }): Promise<void>;
  deleteAccount(password: string): Promise<void>;
}
