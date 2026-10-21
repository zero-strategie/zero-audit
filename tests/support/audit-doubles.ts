import type {
  AuditProgress,
  AuditStartRequest,
  StartedAudit,
} from '../../src/application/audit-runner.js';
import type { SnapshotRepository } from '../../src/application/ports/snapshot-repository.js';
import type { HostResolver } from '../../src/application/ports/host-resolver.js';

/**
 * Stands for the real runner: runs the admission like it does under its lock, and records a
 * snapshot when it is given a repository, so that quotas count the launches.
 */
export class FakeAuditRunner {
  readonly requests: Omit<AuditStartRequest, 'admit'>[] = [];
  startOutcome: StartedAudit | Error = { snapshotId: 'snap-1', projectId: 'proj-1' };
  progressOutcome: AuditProgress | null = null;

  constructor(private readonly recording?: { snapshots: SnapshotRepository; now: () => number }) {}

  async start({ admit, ...request }: AuditStartRequest): Promise<StartedAudit> {
    await admit?.();
    this.requests.push(request);
    if (this.startOutcome instanceof Error) throw this.startOutcome;
    await this.recording?.snapshots.create({
      projectId: this.startOutcome.projectId,
      launchedBy: request.launchedBy ?? null,
      pagesLimit: request.limit,
      startedAt: new Date(this.recording.now()),
    });
    return this.startOutcome;
  }

  progress(): Promise<AuditProgress | null> {
    return Promise.resolve(this.progressOutcome);
  }
}

export class FakeHostResolver implements HostResolver {
  outcome: string[] | Error = ['93.184.216.34'];

  resolve(): Promise<string[]> {
    return this.outcome instanceof Error
      ? Promise.reject(this.outcome)
      : Promise.resolve(this.outcome);
  }
}

/** Server dependencies for tests that never launch an audit. */
export const idleAuditDependencies = () => ({
  auditRunner: new FakeAuditRunner(),
  hostResolver: new FakeHostResolver(),
  allowPrivateTargets: false,
  launchesPerDay: 30,
});
