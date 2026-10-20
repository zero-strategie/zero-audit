import { AuditAlreadyRunning, SnapshotImmutable, SnapshotNotFound } from '../domain/errors.js';
import { ORPHAN_AUDIT_MAX_AGE_MS, type SnapshotStatus } from '../domain/snapshot.js';
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

export interface AuditProgress {
  status: SnapshotStatus;
  pagesCrawled: number;
  pagesLimit: number;
  startedAt: Date;
  rootUrl: string;
}

interface ActiveAudit {
  startedAt: Date;
  stopRequested: boolean;
  /** Set once the snapshot exists; live counters live here, not in the database. */
  snapshot: { id: string; rootUrl: string; pagesLimit: number; pagesCrawled: number } | null;
  done: Promise<void>;
}

/** Thrown from the progress callback to abort the crawl when the runner is stopped. */
class AuditStopped extends Error {}

const noopEvents: AuditEvents = {
  started: () => undefined,
  finished: () => undefined,
  failed: () => undefined,
};

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/** Runs at most one audit at a time in the background; the API never waits for the crawl. */
export class AuditRunner {
  private active: ActiveAudit | null = null;

  constructor(private readonly dependencies: AuditRunnerDependencies) {}

  async start(request: { rootUrl: string; limit: number }): Promise<StartedAudit> {
    const active = this.acquireLock();
    try {
      await this.assertNoRunningSnapshotElsewhere();
      return await this.launch(active, request);
    } catch (error) {
      this.release(active);
      throw error;
    }
  }

  async progress(snapshotId: string): Promise<AuditProgress | null> {
    const live = this.active?.snapshot;
    if (live?.id === snapshotId && this.active) {
      return {
        status: 'running',
        pagesCrawled: live.pagesCrawled,
        pagesLimit: live.pagesLimit,
        startedAt: this.active.startedAt,
        rootUrl: live.rootUrl,
      };
    }
    const details = await this.dependencies.snapshots.getById(snapshotId);
    if (!details) return null;
    const { snapshot } = details;
    const project = await this.dependencies.projects.getById(snapshot.projectId);
    if (!project) return null;
    return {
      status: snapshot.status,
      pagesCrawled: snapshot.pagesCrawled,
      pagesLimit: snapshot.pagesLimit,
      startedAt: snapshot.startedAt,
      rootUrl: project.rootUrl,
    };
  }

  /** Aborts the crawl at its next page, then marks the snapshot failed unless it already ended. */
  async stop(): Promise<void> {
    const active = this.active;
    if (!active) return;
    active.stopRequested = true;
    await active.done;
    if (active.snapshot) await this.failQuietly(active.snapshot.id);
  }

  private async failQuietly(snapshotId: string): Promise<void> {
    try {
      await this.dependencies.snapshots.fail(snapshotId, new Date(this.dependencies.clock.now()));
    } catch (error) {
      if (!(error instanceof SnapshotImmutable)) throw error;
    }
  }

  private release(active: ActiveAudit): void {
    if (this.active === active) this.active = null;
  }

  private acquireLock(): ActiveAudit {
    if (this.active) throw new AuditAlreadyRunning(this.active.startedAt);
    const active: ActiveAudit = {
      startedAt: new Date(this.dependencies.clock.now()),
      stopRequested: false,
      snapshot: null,
      done: Promise.resolve(),
    };
    this.active = active;
    return active;
  }

  private async assertNoRunningSnapshotElsewhere(): Promise<void> {
    const { snapshots, clock } = this.dependencies;
    const orphanLimit = clock.now() - ORPHAN_AUDIT_MAX_AGE_MS;
    const running = await snapshots.listRunning();
    const live = running.find((snapshot) => snapshot.startedAt.getTime() > orphanLimit);
    if (live) throw new AuditAlreadyRunning(live.startedAt);
  }

  private async launch(
    active: ActiveAudit,
    request: { rootUrl: string; limit: number },
  ): Promise<StartedAudit> {
    const { snapshots, projects, logger, delayMs } = this.dependencies;
    const runAudit = this.dependencies.createRunAudit(noopEvents);
    const snapshotId = await new Promise<string>((resolve, reject) => {
      let created = false;
      active.done = runAudit
        .execute({
          ...request,
          delayMs,
          onProgress: (crawled) => {
            if (active.stopRequested) throw new AuditStopped();
            if (active.snapshot) active.snapshot.pagesCrawled = crawled;
          },
          onSnapshotCreated: (id) => {
            created = true;
            resolve(id);
          },
        })
        .then(
          () => undefined,
          (error: unknown) => {
            if (!created) reject(asError(error));
            else if (!active.stopRequested) {
              logger.error(`Background audit failed: ${asError(error).message}`);
            }
          },
        )
        .finally(() => {
          this.release(active);
        });
    });
    const details = await snapshots.getById(snapshotId);
    if (!details) throw new SnapshotNotFound(snapshotId);
    const project = await projects.getById(details.snapshot.projectId);
    active.snapshot = {
      id: snapshotId,
      rootUrl: project?.rootUrl ?? request.rootUrl,
      pagesLimit: request.limit,
      pagesCrawled: 0,
    };
    return { snapshotId, projectId: details.snapshot.projectId };
  }
}
