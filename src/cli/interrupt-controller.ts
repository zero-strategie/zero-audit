import type { Storage } from './storage-factory.js';

export const EXIT_INTERRUPTED = 130;

export interface InterruptController {
  onAuditStarted(storage: Storage, snapshotId: string): void;
  /** Meant for SIGINT: fails the running snapshot, releases the storage, then exits. */
  interrupt(): Promise<void>;
}

export const createInterruptController = (exit: (code: number) => void): InterruptController => {
  let running: { storage: Storage; snapshotId: string } | null = null;
  return {
    onAuditStarted: (storage, snapshotId) => {
      running = { storage, snapshotId };
    },
    interrupt: async () => {
      try {
        if (running !== null) {
          await running.storage.snapshots.fail(running.snapshotId, new Date());
          await running.storage.close();
        }
      } finally {
        exit(EXIT_INTERRUPTED);
      }
    },
  };
};
