import { describe, expect, it } from 'vitest';
import { CheckHealth } from '../../src/application/check-health.js';

describe('CheckHealth', () => {
  it('reports ok when the storage answers', async () => {
    const health = new CheckHealth({ ping: () => Promise.resolve() });

    expect(await health.execute()).toBe('ok');
  });

  it('reports unavailable when the storage ping fails', async () => {
    const health = new CheckHealth({ ping: () => Promise.reject(new Error('down')) });

    expect(await health.execute()).toBe('unavailable');
  });
});
