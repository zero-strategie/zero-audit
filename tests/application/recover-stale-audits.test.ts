import { describe, expect, it } from 'vitest';
import { RecoverStaleAudits } from '../../src/application/recover-stale-audits.js';
import { HEARTBEAT_STALE_MS } from '../../src/domain/snapshot.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';

const NOW = 1_700_000_000_000;

const seed = async () => {
  const projects = new InMemoryProjectRepository();
  const queue = new InMemorySnapshotRepository();
  const project = await projects.findOrCreateByRootUrl({
    ownerId: null,
    rootUrl: 'https://exemple.com/',
    createdAt: new Date(NOW),
  });
  const claimedAt = async (ageMs: number) => {
    await queue.enqueue(
      { projectId: project.id, launchedBy: null, pagesLimit: 10, requestedAt: new Date(NOW) },
      () => Promise.resolve(),
    );
    const claimed = await queue.claimNext('w', new Date(NOW - ageMs));
    if (!claimed) throw new Error('nothing claimed');
    return claimed;
  };
  return { queue, claimedAt };
};

describe('RecoverStaleAudits', () => {
  it('requeues a running audit silent for more than two minutes and keeps a live one', async () => {
    const { queue, claimedAt } = await seed();
    const stale = await claimedAt(HEARTBEAT_STALE_MS + 1);
    const live = await claimedAt(HEARTBEAT_STALE_MS - 1);

    const recovered = await new RecoverStaleAudits(queue, { now: () => NOW }).execute();

    expect(recovered).toBe(1);
    expect(await queue.queuePosition(stale.id)).toBe(1);
    expect(await queue.queuePosition(live.id)).toBeNull();
  });

  it('fails an audit whose attempts are spent', async () => {
    const { queue, claimedAt } = await seed();
    const first = await claimedAt(HEARTBEAT_STALE_MS + 1);
    await queue.requeue(first.id, 1, new Date(NOW));
    await queue.claimNext('w', new Date(NOW - HEARTBEAT_STALE_MS - 1));

    await new RecoverStaleAudits(queue, { now: () => NOW }).execute();

    expect((await queue.getById(first.id))?.snapshot.status).toBe('failed');
  });
});
