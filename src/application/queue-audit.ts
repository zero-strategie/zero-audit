import { normalizeUrl } from '../domain/url.js';
import type { AuditQueue } from './ports/audit-queue.js';
import type { Clock } from './ports/clock.js';
import type { ProjectRepository } from './ports/project-repository.js';

export interface QueuedAudit {
  snapshotId: string;
  projectId: string;
  /** 1 for the next audit to be claimed. */
  position: number;
}

/**
 * Command-line launch: the audit has no owner and no launcher, and the account quotas and the
 * ceiling of the queue (which protect the API) do not apply to it.
 */
export class QueueAudit {
  constructor(
    private readonly queue: Pick<AuditQueue, 'enqueue' | 'queuePosition'>,
    private readonly projects: Pick<ProjectRepository, 'findOrCreateByRootUrl'>,
    private readonly clock: Clock,
  ) {}

  async execute({ url, limit }: { url: string; limit: number }): Promise<QueuedAudit> {
    const requestedAt = new Date(this.clock.now());
    const project = await this.projects.findOrCreateByRootUrl({
      rootUrl: normalizeUrl(url),
      ownerId: null,
      createdAt: requestedAt,
    });
    const snapshot = await this.queue.enqueue(
      { projectId: project.id, launchedBy: null, pagesLimit: limit, requestedAt },
      () => Promise.resolve(),
    );
    const position = await this.queue.queuePosition(snapshot.id);
    return { snapshotId: snapshot.id, projectId: project.id, position: position ?? 1 };
  }
}
