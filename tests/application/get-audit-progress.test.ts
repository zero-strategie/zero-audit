import { describe, expect, it } from 'vitest';
import { GetAuditProgress } from '../../src/application/get-audit-progress.js';
import { SnapshotNotFound } from '../../src/domain/errors.js';
import { ANONYMOUS_READER, type Reader } from '../../src/domain/reader.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { NOW } from '../support/auth-doubles.js';

const OWNER: Reader = { kind: 'account', userId: 'owner', isAdmin: false };
const STRANGER: Reader = { kind: 'account', userId: 'stranger', isAdmin: false };
const SITE = 'https://site.test/';

const setup = async () => {
  const snapshots = new InMemorySnapshotRepository();
  const projects = new InMemoryProjectRepository();
  const project = await projects.findOrCreateByRootUrl({
    rootUrl: SITE,
    ownerId: 'owner',
    createdAt: NOW,
  });
  let arrivals = 0;
  const enqueue = (launchedBy: string | null) =>
    snapshots.enqueue(
      {
        projectId: project.id,
        launchedBy,
        pagesLimit: 50,
        requestedAt: new Date(NOW.getTime() + arrivals++),
      },
      () => Promise.resolve(),
    );
  return { snapshots, enqueue, progress: new GetAuditProgress(snapshots, snapshots, projects) };
};

describe('GetAuditProgress', () => {
  it('reports the position of a queued audit, read from storage', async () => {
    const { enqueue, progress } = await setup();
    await enqueue('x');
    await enqueue('y');
    const third = await enqueue('owner');

    const result = await progress.execute(OWNER, third.id);

    expect(result).toEqual({
      status: 'queued',
      pagesCrawled: 0,
      pagesLimit: 50,
      startedAt: new Date(NOW.getTime() + 2),
      rootUrl: SITE,
      queuePosition: 3,
      attempts: 0,
    });
  });

  it('reports the heartbeat counters of a running audit, without position', async () => {
    const { snapshots, enqueue, progress } = await setup();
    const { id } = await enqueue('owner');
    const claimed = await snapshots.claimNext('worker', NOW);
    await snapshots.heartbeat(id, claimed?.attempts ?? 0, 12, NOW);

    const result = await progress.execute(OWNER, id);

    expect(result).toMatchObject({
      status: 'running',
      pagesCrawled: 12,
      queuePosition: null,
      attempts: 1,
    });
  });

  it('answers not found for the audit of another account and for an unknown one', async () => {
    const { enqueue, progress } = await setup();
    const { id } = await enqueue('owner');

    await expect(progress.execute(STRANGER, id)).rejects.toThrow(SnapshotNotFound);
    await expect(progress.execute(ANONYMOUS_READER, id)).rejects.toThrow(SnapshotNotFound);
    await expect(progress.execute(OWNER, 'unknown')).rejects.toThrow(SnapshotNotFound);
  });
});
