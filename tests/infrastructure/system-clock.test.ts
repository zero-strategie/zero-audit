import { describe, expect, it } from 'vitest';
import { SystemClock } from '../../src/infrastructure/system-clock.js';

describe('SystemClock', () => {
  it('returns wall-clock milliseconds since the epoch, usable as a snapshot date', () => {
    const before = Date.now();
    const now = new SystemClock().now();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});
