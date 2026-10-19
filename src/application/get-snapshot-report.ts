import { SnapshotNotFound } from '../domain/errors.js';
import { diffChecks, type CheckDiff } from '../domain/snapshot-diff.js';
import type { SnapshotDetails, SnapshotRepository } from './ports/snapshot-repository.js';

export interface SnapshotReport {
  readonly details: SnapshotDetails;
  readonly checkDiffs: readonly CheckDiff[];
}

export class GetSnapshotReport {
  constructor(private readonly repository: SnapshotRepository) {}

  async execute(snapshotId: string): Promise<SnapshotReport> {
    const details = await this.repository.getById(snapshotId);
    if (!details) throw new SnapshotNotFound(snapshotId);
    const { snapshot } = details;
    const previous = await this.repository.findPreviousFinished(
      snapshot.projectId,
      snapshot.startedAt,
    );
    const previousDetails = previous ? await this.repository.getById(previous.id) : null;
    return {
      details,
      checkDiffs: diffChecks(previousDetails?.checkResults ?? null, details.checkResults),
    };
  }
}
