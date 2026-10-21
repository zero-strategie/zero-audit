import type { CheckResult } from '../domain/check.js';
import {
  classifyPages,
  groupVariation,
  type GroupCounts,
  type GroupVariation,
} from '../domain/page-groups.js';
import type { Reader } from '../domain/reader.js';
import { buildScoreCard, type ScoreCard } from '../domain/scoring.js';
import { diffChecks, type CheckDiff } from '../domain/snapshot-diff.js';
import { countBySeverity, topIssues, type SeverityCounts } from '../domain/top-issues.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { SnapshotDetails, SnapshotRepository } from './ports/snapshot-repository.js';
import { loadReadableSnapshot } from './readable-snapshot.js';

const TOP_ISSUES_LIMIT = 5;

export interface SnapshotReport {
  readonly details: SnapshotDetails;
  readonly rootUrl: string;
  readonly checkDiffs: readonly CheckDiff[];
  readonly scores: ScoreCard;
  readonly severityCounts: SeverityCounts;
  readonly topIssues: readonly CheckResult[];
  readonly pageGroups: {
    readonly counts: GroupCounts;
    readonly variation: GroupVariation;
  };
}

export class GetSnapshotReport {
  constructor(
    private readonly repository: SnapshotRepository,
    private readonly projects: ProjectRepository,
  ) {}

  async execute(reader: Reader, snapshotId: string): Promise<SnapshotReport> {
    const { details, project } = await loadReadableSnapshot(
      this.repository,
      this.projects,
      reader,
      snapshotId,
    );
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
      rootUrl: project.rootUrl,
      checkDiffs: diffChecks(previousDetails?.checkResults ?? null, details.checkResults),
      scores: buildScoreCard(previousDetails?.checkResults ?? null, details.checkResults),
      severityCounts: countBySeverity(details.checkResults),
      topIssues: topIssues(details.checkResults, TOP_ISSUES_LIMIT),
      pageGroups: { counts, variation: groupVariation(previousCounts, counts) },
    };
  }
}
