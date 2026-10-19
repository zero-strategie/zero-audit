import {
  SnapshotNotFinished,
  SnapshotNotFound,
  SnapshotsFromDifferentProjects,
} from '../domain/errors.js';
import type { Snapshot } from '../domain/snapshot.js';
import { diffChecks, type CheckDiff } from '../domain/snapshot-diff.js';
import type { SnapshotDetails, SnapshotRepository } from './ports/snapshot-repository.js';

export interface SnapshotComparison {
  readonly base: Snapshot;
  readonly target: Snapshot;
  /** `count` is the target's count; `delta` is target minus base. */
  readonly checkDiffs: readonly CheckDiff[];
}

export class CompareSnapshots {
  constructor(private readonly repository: SnapshotRepository) {}

  async execute(baseId: string, targetId: string): Promise<SnapshotComparison> {
    const base = await this.load(baseId);
    const target = await this.load(targetId);
    if (base.snapshot.projectId !== target.snapshot.projectId) {
      throw new SnapshotsFromDifferentProjects(baseId, targetId);
    }
    for (const { snapshot } of [base, target]) {
      if (snapshot.status !== 'finished') throw new SnapshotNotFinished(snapshot.id, snapshot.status);
    }
    return {
      base: base.snapshot,
      target: target.snapshot,
      checkDiffs: diffChecks(base.checkResults, target.checkResults),
    };
  }

  private async load(id: string): Promise<SnapshotDetails> {
    const details = await this.repository.getById(id);
    if (!details) throw new SnapshotNotFound(id);
    return details;
  }
}
