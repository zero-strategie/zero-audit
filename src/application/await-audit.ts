import { SnapshotNotFound } from '../domain/errors.js';
import type { SnapshotStatus } from '../domain/snapshot.js';
import type { Sleeper } from './ports/sleeper.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';

export const AWAIT_POLL_MS = 2 * 1000;

/** Follows an audit crawled by another process, through storage only. */
export class AwaitAudit {
  constructor(
    private readonly snapshots: Pick<SnapshotRepository, 'getById'>,
    private readonly sleeper: Sleeper,
  ) {}

  /** Resolves with `finished` or `failed`; never touches the audit. */
  async execute(
    snapshotId: string,
    onProgress: (crawled: number, limit: number) => void,
  ): Promise<SnapshotStatus> {
    for (;;) {
      const details = await this.snapshots.getById(snapshotId);
      if (!details) throw new SnapshotNotFound(snapshotId);
      const { status, pagesCrawled, pagesLimit } = details.snapshot;
      if (status === 'finished' || status === 'failed') return status;
      onProgress(pagesCrawled, pagesLimit);
      await this.sleeper.sleep(AWAIT_POLL_MS);
    }
  }
}
