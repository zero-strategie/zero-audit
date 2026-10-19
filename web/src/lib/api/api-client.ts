import type { ProjectOverview, SnapshotReport } from './types';

export interface ApiClient {
  listProjects(): Promise<ProjectOverview[]>;
  getSnapshotReport(snapshotId: string): Promise<SnapshotReport>;
}
