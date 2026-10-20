import { describe, expect, it } from 'vitest';
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
        request.onProgress?.(0, request.limit);
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
