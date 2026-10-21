import { describe, expect, it } from 'vitest';
import type { AuditEvents } from '../../src/application/ports/audit-events.js';
import { createInterruptController } from '../../src/cli/interrupt-controller.js';
import type { Storage } from '../../src/cli/storage-factory.js';

const ROOT = 'https://exemple.com/';

const fakeStorage = (calls: string[]): Storage => ({
  projects: {} as Storage['projects'],
  health: {} as Storage['health'],
  users: {} as Storage['users'],
  sessions: {} as Storage['sessions'],
  emailTokens: {} as Storage['emailTokens'],
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
  it('emits audit.failed for the running snapshot on SIGTERM', async () => {
    const calls: string[] = [];
    const events: AuditEvents = {
      started: () => undefined,
      finished: () => undefined,
      failed: (event) => calls.push(`failed:${event.snapshotId}:${event.rootUrl}`),
    };
    const controller = createInterruptController(() => undefined, events);
    controller.onStorageOpened(fakeStorage(calls));
    controller.onAuditStarted('snap-1', ROOT);

    await controller.terminate();

    expect(calls).toEqual(['fail:snap-1', `failed:snap-1:${ROOT}`, 'close']);
  });

  it('marks the snapshot failed, closes the storage once, then exits 130', async () => {
    const calls: string[] = [];
    const controller = createInterruptController((code) => {
      calls.push(`exit:${String(code)}`);
    });
    controller.onStorageOpened(fakeStorage(calls));
    controller.onAuditStarted('snap-1', ROOT);

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

  it('closes the storage and exits 130 when interrupted before any snapshot exists', async () => {
    const calls: string[] = [];
    const controller = createInterruptController((code) => {
      calls.push(`exit:${String(code)}`);
    });
    controller.onStorageOpened(fakeStorage(calls));

    await controller.interrupt();

    expect(calls).toEqual(['close', 'exit:130']);
  });

  it('closes the storage even when marking the snapshot failed rejects', async () => {
    const calls: string[] = [];
    const storage = fakeStorage(calls);
    storage.snapshots.fail = () => Promise.reject(new Error('db down'));
    const controller = createInterruptController((code) => {
      calls.push(`exit:${String(code)}`);
    });
    controller.onStorageOpened(storage);
    controller.onAuditStarted('snap-1', ROOT);

    await expect(controller.interrupt()).rejects.toThrow('db down');

    expect(calls).toEqual(['close', 'exit:130']);
  });

  it('closes the server before the storage, then exits 130', async () => {
    const calls: string[] = [];
    const controller = createInterruptController((code) => {
      calls.push(`exit:${String(code)}`);
    });
    controller.onStorageOpened(fakeStorage(calls));
    controller.onServerStarted({
      close: () => {
        calls.push('server-close');
        return Promise.resolve();
      },
    });

    await controller.interrupt();

    expect(calls).toEqual(['server-close', 'close', 'exit:130']);
  });
});

describe('createInterruptController terminate (SIGTERM)', () => {
  it('marks the running snapshot failed, closes the storage, then exits 143', async () => {
    const calls: string[] = [];
    const controller = createInterruptController((code) => {
      calls.push(`exit:${String(code)}`);
    });
    controller.onStorageOpened(fakeStorage(calls));
    controller.onAuditStarted('snap-1', ROOT);

    await controller.terminate();

    expect(calls).toEqual(['fail:snap-1', 'close', 'exit:143']);
  });

  it('closes the server then the storage and exits 0 when serving', async () => {
    const calls: string[] = [];
    const controller = createInterruptController((code) => {
      calls.push(`exit:${String(code)}`);
    });
    controller.onStorageOpened(fakeStorage(calls));
    controller.onServerStarted({
      close: () => {
        calls.push('server-close');
        return Promise.resolve();
      },
    });

    await controller.terminate();

    expect(calls).toEqual(['server-close', 'close', 'exit:0']);
  });

  it('stops the audit runner after the server and before releasing the storage', async () => {
    const calls: string[] = [];
    const controller = createInterruptController(() => undefined);
    controller.onStorageOpened(fakeStorage(calls));
    controller.onServerStarted({
      close: () => {
        calls.push('server-close');
        return Promise.resolve();
      },
    });
    controller.onAuditRunnerStarted({
      stop: () => {
        calls.push('runner-stop');
        return Promise.resolve();
      },
    });

    await controller.terminate();

    expect(calls).toEqual(['server-close', 'runner-stop', 'close']);
  });

  it('still releases the storage when the runner cannot be stopped', async () => {
    const calls: string[] = [];
    const controller = createInterruptController((code) => {
      calls.push(`exit:${String(code)}`);
    });
    controller.onStorageOpened(fakeStorage(calls));
    controller.onAuditRunnerStarted({ stop: () => Promise.reject(new Error('boom')) });

    await controller.interrupt().catch(() => undefined);

    expect(calls).toEqual(['close', 'exit:130']);
  });
});
