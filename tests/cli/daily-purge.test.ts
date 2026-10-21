import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PURGE_INTERVAL_MS, startDailyPurge } from '../../src/cli/daily-purge.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('startDailyPurge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const build = () => {
    const purge = {
      execute: vi.fn(() =>
        Promise.resolve({ accounts: 0, sessions: 0, emailTokens: 0, launches: 0 }),
      ),
    };
    const errors: string[] = [];
    const logger = {
      info: () => undefined,
      error: (message: string) => {
        errors.push(message);
      },
    };
    return { purge, errors, logger };
  };

  it('purges once before returning, then once a day', async () => {
    const { purge, logger } = build();

    const stop = await startDailyPurge(purge, logger);
    expect(purge.execute).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DAY_MS);
    await vi.advanceTimersByTimeAsync(DAY_MS);

    expect(purge.execute).toHaveBeenCalledTimes(3);
    stop();
    expect(PURGE_INTERVAL_MS).toBe(DAY_MS);
  });

  it('stops purging once stopped', async () => {
    const { purge, logger } = build();
    const stop = await startDailyPurge(purge, logger);

    stop();
    await vi.advanceTimersByTimeAsync(3 * DAY_MS);

    expect(purge.execute).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not keep the process alive', async () => {
    const { purge, logger } = build();
    const unref = vi.spyOn(globalThis, 'setInterval');

    const stop = await startDailyPurge(purge, logger);

    const timer = unref.mock.results[0]?.value as { hasRef(): boolean };
    expect(timer.hasRef()).toBe(false);
    stop();
  });

  it('logs a failing purge without throwing, and tries again the next day', async () => {
    const { purge, errors, logger } = build();
    purge.execute.mockRejectedValueOnce(new Error('database down'));

    const stop = await startDailyPurge(purge, logger);
    await vi.advanceTimersByTimeAsync(DAY_MS);

    expect(errors).toEqual(['Account purge failed: database down']);
    expect(purge.execute).toHaveBeenCalledTimes(2);
    stop();
  });
});
