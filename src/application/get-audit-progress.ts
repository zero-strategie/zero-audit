import { SnapshotNotFound } from '../domain/errors.js';
import type { Reader } from '../domain/reader.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';
import { loadReadableSnapshot } from './readable-snapshot.js';
import type { AuditProgress, AuditRunner } from './audit-runner.js';

export class GetAuditProgress {
  constructor(
    private readonly runner: Pick<AuditRunner, 'progress'>,
    private readonly snapshots: SnapshotRepository,
    private readonly projects: ProjectRepository,
  ) {}

  async execute(reader: Reader, snapshotId: string): Promise<AuditProgress> {
    // Ownership first: the runner's in-memory state must never answer for someone else's audit.
    await loadReadableSnapshot(this.snapshots, this.projects, reader, snapshotId);
    const progress = await this.runner.progress(snapshotId);
    if (!progress) throw new SnapshotNotFound(snapshotId);
    return progress;
  }
}
