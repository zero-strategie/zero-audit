import { SnapshotNotFound } from '../domain/errors.js';
import {
  classifyPages,
  groupVariation,
  type GroupCounts,
  type GroupVariation,
} from '../domain/page-groups.js';
import { buildScoreCard, type ScoreCard } from '../domain/scoring.js';
import { diffChecks, type CheckDiff } from '../domain/snapshot-diff.js';
import type { SnapshotDetails, SnapshotRepository } from './ports/snapshot-repository.js';

export interface SnapshotReport {
  readonly details: SnapshotDetails;
  readonly checkDiffs: readonly CheckDiff[];
  readonly scores: ScoreCard;
  readonly pageGroups: {
    readonly counts: GroupCounts;
    readonly variation: GroupVariation;
  };
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
    const counts = classifyPages(details.pages, details.checkResults).counts;
    const previousCounts = previousDetails
      ? classifyPages(previousDetails.pages, previousDetails.checkResults).counts
      : null;
    return {
      details,
      checkDiffs: diffChecks(previousDetails?.checkResults ?? null, details.checkResults),
      scores: buildScoreCard(previousDetails?.checkResults ?? null, details.checkResults),
      pageGroups: { counts, variation: groupVariation(previousCounts, counts) },
    };
  }
}
