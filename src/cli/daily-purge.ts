import type { Logger } from '../application/ports/logger.js';
import type { PurgeStaleAccounts } from '../application/purge-stale-accounts.js';

export const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Purges now, then every day; a failing purge is logged and never stops the server.
 * Returns the function that stops the schedule.
 */
export const startDailyPurge = async (
  purge: Pick<PurgeStaleAccounts, 'execute'>,
  logger: Logger,
): Promise<() => void> => {
  const run = async (): Promise<void> => {
    try {
      await purge.execute();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error(`Account purge failed: ${reason}`);
    }
  };
  await run();
  const timer = setInterval(() => void run(), PURGE_INTERVAL_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
};
