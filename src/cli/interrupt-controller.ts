import type { AuditEvents } from '../application/ports/audit-events.js';
import type { Storage } from './storage-factory.js';

const EXIT_SUCCESS = 0;
export const EXIT_INTERRUPTED = 130;
export const EXIT_TERMINATED = 143;

export interface ClosableServer {
  close(): Promise<void>;
}

export interface StoppableWorker {
  stop(): Promise<void>;
}

export interface InterruptController {
  onStorageOpened(storage: Storage): void;
  onServerStarted(server: ClosableServer): void;
  onWorkerStarted(worker: StoppableWorker): void;
  onAuditStarted(snapshotId: string, rootUrl: string): void;
  /** Meant for SIGINT: stops the server, fails the running snapshot if any, releases the storage, then exits. */
  interrupt(): Promise<void>;
  /** Meant for SIGTERM (`docker stop`): same cleanup; a stopped server is a clean exit, an aborted audit is not. */
  terminate(): Promise<void>;
}

export const createInterruptController = (
  exit: (code: number) => void,
  events?: AuditEvents,
): InterruptController => {
  let storage: Storage | null = null;
  let audit: { snapshotId: string; rootUrl: string } | null = null;
  let server: ClosableServer | null = null;
  let worker: StoppableWorker | null = null;
  const shutDown = async (exitCode: number): Promise<void> => {
    try {
      try {
        await server?.close();
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
    onServerStarted: (started) => {
      server = started;
    },
    onWorkerStarted: (started) => {
      worker = started;
    },
    onAuditStarted: (snapshotId, rootUrl) => {
      audit = { snapshotId, rootUrl };
    },
    interrupt: () => shutDown(EXIT_INTERRUPTED),
    terminate: () => shutDown(server === null ? EXIT_TERMINATED : EXIT_SUCCESS),
  };
};
