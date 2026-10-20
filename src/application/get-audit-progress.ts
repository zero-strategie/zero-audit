import { SnapshotNotFound } from '../domain/errors.js';
import type { AuditProgress, AuditRunner } from './audit-runner.js';

export class GetAuditProgress {
  constructor(private readonly runner: Pick<AuditRunner, 'progress'>) {}

  async execute(snapshotId: string): Promise<AuditProgress> {
    const progress = await this.runner.progress(snapshotId);
    if (!progress) throw new SnapshotNotFound(snapshotId);
    return progress;
  }
}
