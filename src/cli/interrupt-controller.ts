import type { AuditEvents } from '../application/ports/audit-events.js';
import type { Storage } from '../composition/storage.js';

const EXIT_SUCCESS = 0;
export const EXIT_INTERRUPTED = 130;
export const EXIT_TERMINATED = 143;

export interface StoppableWorker {
  stop(): Promise<void>;
}

export interface InterruptController {
  onStorageOpened(storage: Storage): void;
  onWorkerStarted(worker: StoppableWorker): void;
  /** The dedicated `worker` command: a signal hands the running audit back to the queue and exits 0. */
  onWorkerProcessStarted(worker: StoppableWorker): void;
  onAuditStarted(snapshotId: string, rootUrl: string): void;
  /** Meant for SIGINT: fails the running snapshot if any, releases the storage, then exits. */
  interrupt(): Promise<void>;
  /** Meant for SIGTERM (`docker stop`): same cleanup; a stopped worker is a clean exit, an aborted audit is not. */
  terminate(): Promise<void>;
}

export const createInterruptController = (
  exit: (code: number) => void,
  events?: AuditEvents,
): InterruptController => {
  let storage: Storage | null = null;
  let audit: { snapshotId: string; rootUrl: string } | null = null;
  let worker: StoppableWorker | null = null;
  let isWorkerProcess = false;
  const shutDown = async (exitCode: number): Promise<void> => {
    try {
      try {
        await worker?.stop();
        if (storage !== null && audit !== null) {
          await storage.snapshots.fail(audit.snapshotId, new Date());
          events?.failed(audit);
        }
      } finally {
        await storage?.close();
      }
    } finally {
      exit(exitCode);
    }
  };
  return {
    onStorageOpened: (opened) => {
      storage = opened;
    },
    onWorkerStarted: (started) => {
      worker = started;
    },
    onWorkerProcessStarted: (started) => {
      worker = started;
      isWorkerProcess = true;
    },
    onAuditStarted: (snapshotId, rootUrl) => {
      audit = { snapshotId, rootUrl };
    },
    interrupt: () => shutDown(isWorkerProcess ? EXIT_SUCCESS : EXIT_INTERRUPTED),
    terminate: () => shutDown(!isWorkerProcess ? EXIT_TERMINATED : EXIT_SUCCESS),
  };
};
