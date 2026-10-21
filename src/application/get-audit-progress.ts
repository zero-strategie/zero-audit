import type { Reader } from '../domain/reader.js';
import type { SnapshotStatus } from '../domain/snapshot.js';
import type { AuditQueue } from './ports/audit-queue.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';
import { loadReadableSnapshot } from './readable-snapshot.js';

export interface AuditProgress {
  status: SnapshotStatus;
  pagesCrawled: number;
  pagesLimit: number;
  startedAt: Date;
  rootUrl: string;
  /** 1 for the next audit to be claimed; null unless the audit is queued. */
  queuePosition: number | null;
  attempts: number;
}

/** Everything comes from storage, so that the API and the worker may be different processes. */
export class GetAuditProgress {
  constructor(
    private readonly queue: Pick<AuditQueue, 'queuePosition'>,
    private readonly snapshots: SnapshotRepository,
    private readonly projects: ProjectRepository,
  ) {}

  async execute(reader: Reader, snapshotId: string): Promise<AuditProgress> {
    const { details, project } = await loadReadableSnapshot(
      this.snapshots,
      this.projects,
      reader,
      snapshotId,
    );
    const { snapshot } = details;
    return {
      status: snapshot.status,
      pagesCrawled: snapshot.pagesCrawled,
      pagesLimit: snapshot.pagesLimit,
      startedAt: snapshot.startedAt,
      rootUrl: project.rootUrl,
      queuePosition: await this.queue.queuePosition(snapshot.id),
      attempts: snapshot.attempts,
    };
  }
}
