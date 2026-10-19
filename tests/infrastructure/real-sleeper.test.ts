import { describe, expect, it } from 'vitest';
import { RealSleeper } from '../../src/infrastructure/real-sleeper.js';

describe('RealSleeper', () => {
  it('resolves only after the requested duration', async () => {
    const startedAt = performance.now();

    await new RealSleeper().sleep(30);

    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(25);
  });
});
