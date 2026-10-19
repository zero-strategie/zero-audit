import type { Storage } from './storage-factory.js';

export const EXIT_INTERRUPTED = 130;

export interface InterruptController {
  onStorageOpened(storage: Storage): void;
  onAuditStarted(snapshotId: string): void;
  /** Meant for SIGINT: fails the running snapshot if any, releases the storage, then exits. */
  interrupt(): Promise<void>;
}

export const createInterruptController = (exit: (code: number) => void): InterruptController => {
  let storage: Storage | null = null;
  let snapshotId: string | null = null;
  return {
    onStorageOpened: (opened) => {
      storage = opened;
    },
    onAuditStarted: (id) => {
      snapshotId = id;
    },
    interrupt: async () => {
      try {
        try {
          if (storage !== null && snapshotId !== null) {
            await storage.snapshots.fail(snapshotId, new Date());
          }
        } finally {
          await storage?.close();
        }
      } finally {
        exit(EXIT_INTERRUPTED);
      }
    },
  };
};
