import { describe, expect, it } from 'vitest';
import { runSteps } from '../../scripts/smoke-steps.js';

describe('runSteps', () => {
  it('runs every step in order and cleans up when all succeed', async () => {
    const calls: string[] = [];
    const failure = await runSteps(
      [
        { name: 'one', run: () => void calls.push('one') },
        { name: 'two', run: () => void calls.push('two') },
      ],
      () => void calls.push('cleanup'),
    );
    expect(failure).toBeNull();
    expect(calls).toEqual(['one', 'two', 'cleanup']);
  });

  it('stops at the first failing step, names it and still cleans up', async () => {
    const calls: string[] = [];
    const failure = await runSteps(
      [
        {
          name: 'broken',
          run: () => {
            throw new Error('boom');
          },
        },
        { name: 'never', run: () => void calls.push('never') },
      ],
      () => void calls.push('cleanup'),
    );
    expect(failure).toBe('step "broken" failed: boom');
    expect(calls).toEqual(['cleanup']);
  });

  it('names an asynchronous failing step', async () => {
    const failure = await runSteps(
      [{ name: 'async', run: () => Promise.reject(new Error('late')) }],
      () => undefined,
    );
    expect(failure).toBe('step "async" failed: late');
  });
});
