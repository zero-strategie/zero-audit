import { describe, expect, it } from 'vitest';
import { RealSleeper } from '../../src/infrastructure/real-sleeper.js';

describe('RealSleeper', () => {
  it('resolves only after the requested duration', async () => {
    const startedAt = performance.now();

    await new RealSleeper().sleep(30);

    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(25);
  });

  it('resolves at once when the signal fires, without waiting for the duration', async () => {
    const controller = new AbortController();
    const startedAt = performance.now();

    const sleeping = new RealSleeper().sleep(10_000, controller.signal);
    controller.abort();
    await sleeping;

    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });
});
