import { describe, expect, it } from 'vitest';
import { createInterruptController } from '../../src/cli/interrupt-controller.js';
import type { Storage } from '../../src/cli/storage-factory.js';

const fakeStorage = (calls: string[]): Storage => ({
  projects: {} as Storage['projects'],
  snapshots: {
    fail: (id: string) => {
      calls.push(`fail:${id}`);
      return Promise.resolve();
    },
  } as unknown as Storage['snapshots'],
  close: () => {
    calls.push('close');
    return Promise.resolve();
  },
});

describe('createInterruptController', () => {
  it('marks the snapshot failed, closes the storage once, then exits 130', async () => {
    const calls: string[] = [];
    const controller = createInterruptController((code) => {
      calls.push(`exit:${String(code)}`);
    });
    controller.onAuditStarted(fakeStorage(calls), 'snap-1');

    await controller.interrupt();

    expect(calls).toEqual(['fail:snap-1', 'close', 'exit:130']);
  });

  it('still exits 130 when no audit is running', async () => {
    const calls: string[] = [];
    const controller = createInterruptController((code) => {
      calls.push(`exit:${String(code)}`);
    });

    await controller.interrupt();

    expect(calls).toEqual(['exit:130']);
  });
});
