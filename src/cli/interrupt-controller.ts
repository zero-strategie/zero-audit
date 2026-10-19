import type { Storage } from './storage-factory.js';

const EXIT_SUCCESS = 0;
export const EXIT_INTERRUPTED = 130;
export const EXIT_TERMINATED = 143;

export interface ClosableServer {
  close(): Promise<void>;
}

export interface InterruptController {
  onStorageOpened(storage: Storage): void;
  onServerStarted(server: ClosableServer): void;
  onAuditStarted(snapshotId: string): void;
  /** Meant for SIGINT: stops the server, fails the running snapshot if any, releases the storage, then exits. */
  interrupt(): Promise<void>;
  /** Meant for SIGTERM (`docker stop`): same cleanup; a stopped server is a clean exit, an aborted audit is not. */
  terminate(): Promise<void>;
}

export const createInterruptController = (exit: (code: number) => void): InterruptController => {
  let storage: Storage | null = null;
  let snapshotId: string | null = null;
  let server: ClosableServer | null = null;
  const shutDown = async (exitCode: number): Promise<void> => {
    try {
      try {
        await server?.close();
        if (storage !== null && snapshotId !== null) {
          await storage.snapshots.fail(snapshotId, new Date());
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
    onAuditStarted: (id) => {
      snapshotId = id;
    },
    interrupt: () => shutDown(EXIT_INTERRUPTED),
    terminate: () => shutDown(server === null ? EXIT_TERMINATED : EXIT_SUCCESS),
  };
};
