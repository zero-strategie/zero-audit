import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter } from '../../../src/infrastructure/rate-limit/in-memory-rate-limiter.js';
import { MutableClock } from '../../support/auth-doubles.js';

const WINDOW_MS = 15 * 60 * 1000;

const setup = () => {
  const clock = new MutableClock();
  return { clock, limiter: new InMemoryRateLimiter(clock) };
};

describe('InMemoryRateLimiter', () => {
  it('blocks a key once it reached the limit within the window', () => {
    const { limiter } = setup();

    for (let hit = 0; hit < 2; hit += 1) limiter.hit('login:a', WINDOW_MS);
    expect(limiter.isBlocked('login:a', 3, WINDOW_MS)).toBe(false);
    limiter.hit('login:a', WINDOW_MS);

    expect(limiter.isBlocked('login:a', 3, WINDOW_MS)).toBe(true);
    expect(limiter.isBlocked('login:b', 3, WINDOW_MS)).toBe(false);
  });

  it('stops counting events older than the window', () => {
    const { limiter, clock } = setup();
    for (let hit = 0; hit < 3; hit += 1) limiter.hit('login:a', WINDOW_MS);

    clock.advance(WINDOW_MS - 1);
    expect(limiter.isBlocked('login:a', 3, WINDOW_MS)).toBe(true);
    clock.advance(1);

    expect(limiter.isBlocked('login:a', 3, WINDOW_MS)).toBe(false);
  });

  it('forgets expired keys so that memory does not grow without bound', () => {
    const { limiter, clock } = setup();
    limiter.hit('ip:1', WINDOW_MS);
    expect(limiter.trackedKeys).toBe(1);

    clock.advance(2 * WINDOW_MS);
    limiter.hit('ip:2', WINDOW_MS);

    expect(limiter.trackedKeys).toBe(1);
  });
});
