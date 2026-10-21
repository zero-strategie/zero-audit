import type { HostResolver } from '../../src/application/ports/host-resolver.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';

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
  queue: new InMemorySnapshotRepository(),
  hostResolver: new FakeHostResolver(),
  allowPrivateTargets: false,
  launchesPerDay: 30,
  queueMax: 20,
});
