import type { Check, CheckResult, Severity, Theme } from '../domain/check.js';
import type { Reader } from '../domain/reader.js';
import { diffChecks } from '../domain/snapshot-diff.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';
import { loadReadableSnapshot } from './readable-snapshot.js';

export interface IssueRow {
  readonly checkId: number;
  readonly label: string;
  readonly severity: Severity;
  readonly theme: Theme;
  readonly count: number;
  readonly examined: number;
  readonly delta: number;
  readonly newCount: number;
  readonly fixedCount: number;
}

export class ListIssues {
  constructor(
    private readonly repository: SnapshotRepository,
    private readonly projects: ProjectRepository,
    private readonly checks: readonly Check[],
  ) {}

  async execute(
    reader: Reader,
    snapshotId: string,
    filter: { severity?: Severity },
  ): Promise<IssueRow[]> {
    const { details } = await loadReadableSnapshot(
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
    const previousResults = previous
      ? (await this.repository.getById(previous.id))?.checkResults
      : null;
    const resultById = new Map<number, CheckResult>(
      details.checkResults.map((r) => [r.checkId, r]),
    );
    const diffById = new Map(
      diffChecks(previousResults ?? null, details.checkResults).map((diff) => [diff.checkId, diff]),
    );
    return [...this.checks]
      .sort((a, b) => a.id - b.id)
      .filter(({ severity }) => filter.severity === undefined || severity === filter.severity)
      .map((check) => {
        const result = resultById.get(check.id);
        const diff = diffById.get(check.id);
        return {
          checkId: check.id,
          label: check.label,
          severity: check.severity,
          theme: check.theme,
          count: result?.count ?? 0,
          examined: result?.examined ?? 0,
          delta: diff?.delta ?? 0,
          newCount: diff?.newCount ?? 0,
          fixedCount: diff?.fixedCount ?? 0,
        };
      });
  }
}
