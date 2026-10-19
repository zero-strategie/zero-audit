import type { Check, IssueOccurrence } from '../domain/check.js';
import { SnapshotNotFound, UnknownCheck } from '../domain/errors.js';
import { paginate, type Paginated, type PageRequest } from '../domain/pagination.js';
import { canonicalJson } from '../domain/snapshot-diff.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Page url first (site-level occurrences before the others), then canonical info: a total order. */
const stableOrder = (occurrences: readonly IssueOccurrence[]): IssueOccurrence[] =>
  occurrences
    .map((occurrence) => ({
      occurrence,
      key: [occurrence.pageUrl ?? '', canonicalJson(occurrence.info)] as const,
    }))
    .sort((a, b) => compare(a.key[0], b.key[0]) || compare(a.key[1], b.key[1]))
    .map(({ occurrence }) => occurrence);

export class ListOccurrences {
  constructor(
    private readonly repository: SnapshotRepository,
    private readonly checks: readonly Check[],
  ) {}

  async execute(
    snapshotId: string,
    checkId: number,
    request: PageRequest,
  ): Promise<Paginated<IssueOccurrence>> {
    const details = await this.repository.getById(snapshotId);
    if (!details) throw new SnapshotNotFound(snapshotId);
    if (!this.checks.some(({ id }) => id === checkId)) throw new UnknownCheck(checkId);
    const result = details.checkResults.find((candidate) => candidate.checkId === checkId);
    return paginate(stableOrder(result?.occurrences ?? []), request);
  }
}
