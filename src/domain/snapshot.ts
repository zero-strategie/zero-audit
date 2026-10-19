import { SnapshotImmutable } from './errors.js';

export type SnapshotStatus = 'running' | 'finished' | 'failed';

export interface SnapshotProps {
  readonly id: string;
  readonly projectId: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly pagesCrawled: number;
  readonly pagesLimit: number;
  readonly status: SnapshotStatus;
}

export class Snapshot implements SnapshotProps {
  readonly id: string;
  readonly projectId: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly pagesCrawled: number;
  readonly pagesLimit: number;
  readonly status: SnapshotStatus;

  private constructor(props: SnapshotProps) {
    this.id = props.id;
    this.projectId = props.projectId;
    this.startedAt = props.startedAt;
    this.finishedAt = props.finishedAt;
    this.pagesCrawled = props.pagesCrawled;
    this.pagesLimit = props.pagesLimit;
    this.status = props.status;
  }

  static start(input: {
    id: string;
    projectId: string;
    startedAt: Date;
    pagesLimit: number;
  }): Snapshot {
    return new Snapshot({ ...input, finishedAt: null, pagesCrawled: 0, status: 'running' });
  }

  static restore(props: SnapshotProps): Snapshot {
    return new Snapshot(props);
  }

  finish(now: Date, pagesCrawled: number): Snapshot {
    this.assertWritable();
    return new Snapshot({ ...this.props(), finishedAt: now, pagesCrawled, status: 'finished' });
  }

  fail(now: Date): Snapshot {
    this.assertWritable();
    return new Snapshot({ ...this.props(), finishedAt: now, status: 'failed' });
  }

  private props(): SnapshotProps {
    return {
      id: this.id,
      projectId: this.projectId,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      pagesCrawled: this.pagesCrawled,
      pagesLimit: this.pagesLimit,
      status: this.status,
    };
  }

  assertWritable(): void {
    if (this.status !== 'running') {
      throw new SnapshotImmutable(this.id, this.status);
    }
  }
}
