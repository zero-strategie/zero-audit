import { InvalidSnapshotTransition, SnapshotImmutable } from './errors.js';

/** An audit is tried at most this many times (a crash or a deploy interrupts an attempt). */
export const MAX_ATTEMPTS = 2;
/** A `running` audit whose heartbeat is older than this has lost its worker. */
export const HEARTBEAT_STALE_MS = 2 * 60 * 1000;
/** A worker whose presence is older than this is reported unhealthy. */
export const WORKER_HEALTH_MAX_AGE_MS = 60 * 1000;
/** Delay before a worker polls again when the queue is empty. */
export const EMPTY_QUEUE_POLL_MS = 2 * 1000;
/** A running audit refreshes its heartbeat every N crawled pages or every `HEARTBEAT_EVERY_MS`. */
export const HEARTBEAT_EVERY_PAGES = 5;
export const HEARTBEAT_EVERY_MS = 2 * 1000;
/** A worker records its presence this often, whatever the crawl does. */
export const WORKER_PRESENCE_EVERY_MS = 15 * 1000;
/** Interval between two scans for audits whose worker disappeared. */
export const RECOVERY_EVERY_MS = 60 * 1000;

export type SnapshotStatus = 'queued' | 'running' | 'finished' | 'failed';

export interface SnapshotProps {
  readonly id: string;
  readonly projectId: string;
  /** Date of the request: set when the audit is queued and never changed afterwards. */
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly pagesCrawled: number;
  readonly pagesLimit: number;
  readonly status: SnapshotStatus;
  readonly attempts: number;
  /** Queue order. Kept when an interrupted audit goes back to the queue. */
  readonly queuedAt: Date | null;
  readonly heartbeatAt: Date | null;
}

export class Snapshot implements SnapshotProps {
  readonly id: string;
  readonly projectId: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly pagesCrawled: number;
  readonly pagesLimit: number;
  readonly status: SnapshotStatus;
  readonly attempts: number;
  readonly queuedAt: Date | null;
  readonly heartbeatAt: Date | null;

  private constructor(props: SnapshotProps) {
    this.id = props.id;
    this.projectId = props.projectId;
    this.startedAt = props.startedAt;
    this.finishedAt = props.finishedAt;
    this.pagesCrawled = props.pagesCrawled;
    this.pagesLimit = props.pagesLimit;
    this.status = props.status;
    this.attempts = props.attempts;
    this.queuedAt = props.queuedAt;
    this.heartbeatAt = props.heartbeatAt;
  }

  static start(input: {
    id: string;
    projectId: string;
    startedAt: Date;
    pagesLimit: number;
  }): Snapshot {
    return new Snapshot({
      ...input,
      finishedAt: null,
      pagesCrawled: 0,
      status: 'running',
      attempts: 0,
      queuedAt: null,
      heartbeatAt: null,
    });
  }

  static enqueue(input: {
    id: string;
    projectId: string;
    startedAt: Date;
    pagesLimit: number;
  }): Snapshot {
    return new Snapshot({
      ...input,
      finishedAt: null,
      pagesCrawled: 0,
      status: 'queued',
      attempts: 0,
      queuedAt: input.startedAt,
      heartbeatAt: null,
    });
  }

  static restore(props: SnapshotProps): Snapshot {
    return new Snapshot(props);
  }

  claim(now: Date): Snapshot {
    if (this.status !== 'queued')
      throw new InvalidSnapshotTransition(this.id, this.status, 'claim');
    return new Snapshot({
      ...this.props(),
      status: 'running',
      attempts: this.attempts + 1,
      heartbeatAt: now,
    });
  }

  requeue(): Snapshot {
    this.assertWritable();
    return new Snapshot({ ...this.props(), status: 'queued', heartbeatAt: null });
  }

  /** The worker running this audit is gone: try again, unless every attempt has been spent. */
  interrupt(now: Date): Snapshot {
    return this.attempts < MAX_ATTEMPTS ? this.requeue() : this.fail(now);
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
      attempts: this.attempts,
      queuedAt: this.queuedAt,
      heartbeatAt: this.heartbeatAt,
    };
  }

  assertWritable(): void {
    if (this.status !== 'running') {
      throw new SnapshotImmutable(this.id, this.status);
    }
  }
}
