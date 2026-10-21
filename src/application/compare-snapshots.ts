import { SnapshotNotFinished, SnapshotsFromDifferentProjects } from '../domain/errors.js';
import type { Snapshot } from '../domain/snapshot.js';
import type { Reader } from '../domain/reader.js';
import { buildScoreCard, type ScoreCard } from '../domain/scoring.js';
import { diffChecks, type CheckDiff } from '../domain/snapshot-diff.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { SnapshotDetails, SnapshotRepository } from './ports/snapshot-repository.js';
import { loadReadableSnapshot } from './readable-snapshot.js';

export interface SnapshotComparison {
  readonly base: Snapshot;
  readonly target: Snapshot;
  /** `count` is the target's count; `delta` is target minus base. */
  readonly checkDiffs: readonly CheckDiff[];
  /** Scores of the target, their variation being target minus base. */
  readonly scores: ScoreCard;
}

export class CompareSnapshots {
  constructor(
    private readonly repository: SnapshotRepository,
    private readonly projects: ProjectRepository,
  ) {}

  async execute(reader: Reader, baseId: string, targetId: string): Promise<SnapshotComparison> {
    const base = await this.load(reader, baseId);
    const target = await this.load(reader, targetId);
    if (base.snapshot.projectId !== target.snapshot.projectId) {
      throw new SnapshotsFromDifferentProjects(baseId, targetId);
    }
    for (const { snapshot } of [base, target]) {
      if (snapshot.status !== 'finished')
        throw new SnapshotNotFinished(snapshot.id, snapshot.status);
    }
    return {
      base: base.snapshot,
      target: target.snapshot,
      checkDiffs: diffChecks(base.checkResults, target.checkResults),
      scores: buildScoreCard(base.checkResults, target.checkResults),
    };
  }

  private async load(reader: Reader, id: string): Promise<SnapshotDetails> {
    return (await loadReadableSnapshot(this.repository, this.projects, reader, id)).details;
  }
}
