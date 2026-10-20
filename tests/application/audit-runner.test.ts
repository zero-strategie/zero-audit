import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditRunner } from '../../src/application/audit-runner.js';
import type { Logger } from '../../src/application/ports/logger.js';
import type { AuditRequest, RunAudit } from '../../src/application/run-audit.js';
import type { SnapshotDetails } from '../../src/application/ports/snapshot-repository.js';
import { AuditAlreadyRunning } from '../../src/domain/errors.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';

const ROOT = 'https://exemple.com/';
const NOW = 1_700_000_000_000;
const HOUR_MS = 3_600_000;
const SIX_HOURS_MS = 6 * HOUR_MS;

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
}

const deferred = (): Deferred => {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  return undefined;
};

class Harness {
  readonly projects = new InMemoryProjectRepository();
  readonly snapshots = new InMemorySnapshotRepository();
  readonly errors: string[] = [];
  readonly requests: AuditRequest[] = [];
  /** Settles the in-flight fake audit; resolving it finishes the snapshot like the real use-case. */
  crawl = deferred();
  failBeforeCreation: Error | null = null;
  now = NOW;

  readonly logger: Logger = {
    info: () => undefined,
    error: (message) => {
      this.errors.push(message);
    },
  };

  private readonly runAudit: Pick<RunAudit, 'execute'> = {
    execute: async (request) => {
      this.requests.push(request);
      if (this.failBeforeCreation) throw this.failBeforeCreation;
      const startedAt = new Date(this.now);
      const project = await this.projects.findOrCreateByRootUrl({
        rootUrl: request.rootUrl,
        createdAt: startedAt,
      });
      const snapshot = await this.snapshots.create({
        projectId: project.id,
        pagesLimit: request.limit,
        startedAt,
      });
      request.onSnapshotCreated?.(snapshot.id);
      try {
        await this.crawl.promise;
        request.onProgress?.(1, request.limit);
      } catch (error) {
        await this.snapshots.fail(snapshot.id, new Date(this.now));
        throw error;
      }
      await this.snapshots.finish(snapshot.id, { finishedAt: new Date(this.now), pagesCrawled: 2 });
      return (await this.snapshots.getById(snapshot.id)) as SnapshotDetails;
    },
  };

  readonly runner = new AuditRunner({
    createRunAudit: () => this.runAudit,
    snapshots: this.snapshots,
    projects: this.projects,
    clock: { now: () => this.now },
    logger: this.logger,
    delayMs: 250,
  });
}

describe('AuditRunner.start', () => {
  it('resolves with the snapshot and project ids before the crawl ends', async () => {
    const harness = new Harness();

    const started = await harness.runner.start({ rootUrl: ROOT, limit: 100 });

    const running = await harness.snapshots.listRunning();
    expect(running.map((snapshot) => snapshot.id)).toEqual([started.snapshotId]);
    expect(running[0]?.projectId).toBe(started.projectId);
    expect(harness.requests[0]).toMatchObject({ rootUrl: ROOT, limit: 100, delayMs: 250 });
  });
});

describe('AuditRunner.start locking', () => {
  it('rejects while an audit runs in the same process, whatever the project', async () => {
    const harness = new Harness();
    await harness.runner.start({ rootUrl: ROOT, limit: 100 });

    await expect(
      harness.runner.start({ rootUrl: 'https://autre.example/', limit: 50 }),
    ).rejects.toBeInstanceOf(AuditAlreadyRunning);
  });

  it('rejects with the start date of a running snapshot created less than 6 hours ago elsewhere', async () => {
    const harness = new Harness();
    const project = await harness.projects.findOrCreateByRootUrl({
      rootUrl: ROOT,
      createdAt: new Date(NOW),
    });
    const startedAt = new Date(NOW - SIX_HOURS_MS + 1);
    await harness.snapshots.create({ projectId: project.id, pagesLimit: 100, startedAt });

    const rejection = await rejectionOf(harness.runner.start({ rootUrl: ROOT, limit: 100 }));

    expect(rejection).toBeInstanceOf(AuditAlreadyRunning);
    expect(rejection instanceof AuditAlreadyRunning && rejection.startedAt).toEqual(startedAt);
    expect(harness.requests).toEqual([]);
  });

  it('starts when the running snapshot is older than 6 hours', async () => {
    const harness = new Harness();
    const project = await harness.projects.findOrCreateByRootUrl({
      rootUrl: ROOT,
      createdAt: new Date(NOW),
    });
    await harness.snapshots.create({
      projectId: project.id,
      pagesLimit: 100,
      startedAt: new Date(NOW - SIX_HOURS_MS - 1),
    });

    await expect(harness.runner.start({ rootUrl: ROOT, limit: 100 })).resolves.toBeDefined();
  });
});

describe('AuditRunner failures', () => {
  it('rejects start with the error of an audit that fails before creating its snapshot, and frees the lock', async () => {
    const harness = new Harness();
    harness.failBeforeCreation = new Error('cannot reach database');

    const rejection = await rejectionOf(harness.runner.start({ rootUrl: ROOT, limit: 100 }));

    expect(rejection).toEqual(new Error('cannot reach database'));
    harness.failBeforeCreation = null;
    await expect(harness.runner.start({ rootUrl: ROOT, limit: 100 })).resolves.toBeDefined();
  });

  describe('after the snapshot is created', () => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown): void => {
      unhandled.push(reason);
    };

    afterEach(() => {
      process.off('unhandledRejection', record);
      unhandled.length = 0;
    });

    it('logs the error without any unhandled rejection and frees the lock', async () => {
      process.on('unhandledRejection', record);
      const harness = new Harness();
      await harness.runner.start({ rootUrl: ROOT, limit: 100 });

      harness.crawl.reject(new Error('boom'));
      await vi.waitFor(() => {
        expect(harness.errors).toEqual(['Background audit failed: boom']);
      });
      await new Promise((resolve) => setImmediate(resolve));

      expect(unhandled).toEqual([]);
      harness.crawl = deferred();
      await expect(harness.runner.start({ rootUrl: ROOT, limit: 100 })).resolves.toBeDefined();
    });
  });
});

describe('AuditRunner.progress', () => {
  it('reads a running audit from memory', async () => {
    const harness = new Harness();
    const { snapshotId } = await harness.runner.start({ rootUrl: ROOT, limit: 100 });

    harness.requests[0]?.onProgress?.(3, 100);

    expect(await harness.runner.progress(snapshotId)).toEqual({
      status: 'running',
      pagesCrawled: 3,
      pagesLimit: 100,
      startedAt: new Date(NOW),
      rootUrl: ROOT,
    });
  });

  it('reads a finished audit from the database', async () => {
    const harness = new Harness();
    const { snapshotId } = await harness.runner.start({ rootUrl: ROOT, limit: 100 });

    harness.crawl.resolve();

    await vi.waitFor(async () => {
      expect(await harness.runner.progress(snapshotId)).toMatchObject({
        status: 'finished',
        pagesCrawled: 2,
      });
    });
  });

  it('reports 0 pages for a running snapshot created by another process', async () => {
    const harness = new Harness();
    const project = await harness.projects.findOrCreateByRootUrl({
      rootUrl: ROOT,
      createdAt: new Date(NOW),
    });
    const snapshot = await harness.snapshots.create({
      projectId: project.id,
      pagesLimit: 250,
      startedAt: new Date(NOW),
    });

    expect(await harness.runner.progress(snapshot.id)).toEqual({
      status: 'running',
      pagesCrawled: 0,
      pagesLimit: 250,
      startedAt: new Date(NOW),
      rootUrl: ROOT,
    });
  });

  it('returns null for an unknown snapshot', async () => {
    expect(await new Harness().runner.progress('unknown')).toBeNull();
  });
});

describe('AuditRunner.stop', () => {
  it('fails the running snapshot and waits for the background audit', async () => {
    const harness = new Harness();
    const { snapshotId } = await harness.runner.start({ rootUrl: ROOT, limit: 100 });

    const stopping = harness.runner.stop();
    harness.crawl.resolve();
    await stopping;

    expect((await harness.snapshots.getById(snapshotId))?.snapshot.status).toBe('failed');
    expect(harness.errors).toEqual([]);
    await expect(harness.runner.start({ rootUrl: ROOT, limit: 100 })).resolves.toBeDefined();
  });

  it('ignores a snapshot that is already finished', async () => {
    const harness = new Harness();
    const { snapshotId } = await harness.runner.start({ rootUrl: ROOT, limit: 100 });
    const stopping = harness.runner.stop();
    await harness.snapshots.fail(snapshotId, new Date(NOW));
    harness.crawl.reject(new Error('stopped'));

    await expect(stopping).resolves.toBeUndefined();
  });

  it('does nothing when no audit runs', async () => {
    await expect(new Harness().runner.stop()).resolves.toBeUndefined();
  });
});
