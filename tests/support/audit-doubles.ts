import type { AuditProgress, StartedAudit } from '../../src/application/audit-runner.js';
import type { HostResolver } from '../../src/application/ports/host-resolver.js';

export class FakeAuditRunner {
  readonly requests: { rootUrl: string; limit: number }[] = [];
  startOutcome: StartedAudit | Error = { snapshotId: 'snap-1', projectId: 'proj-1' };
  progressOutcome: AuditProgress | null = null;

  start(request: { rootUrl: string; limit: number }): Promise<StartedAudit> {
    this.requests.push(request);
    return this.startOutcome instanceof Error
      ? Promise.reject(this.startOutcome)
      : Promise.resolve(this.startOutcome);
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
});
