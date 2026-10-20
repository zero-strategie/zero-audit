import { AuditAlreadyRunning } from '../domain/errors.js';
import { ORPHAN_AUDIT_MAX_AGE_MS } from '../domain/snapshot.js';
import type { AuditEvents } from './ports/audit-events.js';
import type { Clock } from './ports/clock.js';
import type { Logger } from './ports/logger.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';
import type { RunAudit } from './run-audit.js';

export interface AuditRunnerDependencies {
  createRunAudit(events: AuditEvents): Pick<RunAudit, 'execute'>;
  snapshots: SnapshotRepository;
  projects: ProjectRepository;
  clock: Clock;
  logger: Logger;
  delayMs: number;
}

export interface StartedAudit {
  snapshotId: string;
  projectId: string;
}

const noopEvents: AuditEvents = {
  started: () => undefined,
  finished: () => undefined,
  failed: () => undefined,
};

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/** Runs at most one audit at a time in the background; the API never waits for the crawl. */
export class AuditRunner {
  private lockedSince: Date | null = null;

  constructor(private readonly dependencies: AuditRunnerDependencies) {}

  async start(request: { rootUrl: string; limit: number }): Promise<StartedAudit> {
    this.acquireLock();
    try {
      await this.assertNoRunningSnapshotElsewhere();
      return await this.launch(request);
    } catch (error) {
      this.lockedSince = null;
      throw error;
    }
  }

  private acquireLock(): void {
    if (this.lockedSince) throw new AuditAlreadyRunning(this.lockedSince);
    this.lockedSince = new Date(this.dependencies.clock.now());
  }

  private async assertNoRunningSnapshotElsewhere(): Promise<void> {
    const { snapshots, clock } = this.dependencies;
    const orphanLimit = clock.now() - ORPHAN_AUDIT_MAX_AGE_MS;
    const running = await snapshots.listRunning();
    const live = running.find((snapshot) => snapshot.startedAt.getTime() > orphanLimit);
    if (live) throw new AuditAlreadyRunning(live.startedAt);
  }

  private async launch(request: { rootUrl: string; limit: number }): Promise<StartedAudit> {
    const { snapshots, logger, delayMs } = this.dependencies;
    const runAudit = this.dependencies.createRunAudit(noopEvents);
    const snapshotId = await new Promise<string>((resolve, reject) => {
      let created = false;
      runAudit
        .execute({
          ...request,
          delayMs,
          onSnapshotCreated: (id) => {
            created = true;
            resolve(id);
          },
        })
        .catch((error: unknown) => {
          if (!created) reject(asError(error));
          else logger.error(`Background audit failed: ${asError(error).message}`);
        })
        .finally(() => {
          this.lockedSince = null;
        });
    });
    const details = await snapshots.getById(snapshotId);
    return { snapshotId, projectId: details?.snapshot.projectId ?? '' };
  }
}
