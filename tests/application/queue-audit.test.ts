import { describe, expect, it } from 'vitest';
import { AwaitAudit } from '../../src/application/await-audit.js';
import { QueueAudit } from '../../src/application/queue-audit.js';
import type { Sleeper } from '../../src/application/ports/sleeper.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';
import { MutableClock } from '../support/mutable-clock.js';

const URL_TO_AUDIT = 'https://exemple.com/';

const build = () => {
  const snapshots = new InMemorySnapshotRepository();
  const projects = new InMemoryProjectRepository();
  const clock = new MutableClock();
  return { snapshots, projects, clock, queueAudit: new QueueAudit(snapshots, projects, clock) };
};

describe('QueueAudit', () => {
  it('queues the audit in an ownerless project, launched by nobody', async () => {
    const { snapshots, projects, queueAudit } = build();

    const started = await queueAudit.execute({ url: URL_TO_AUDIT, limit: 40 });

    const details = await snapshots.getById(started.snapshotId);
    expect(details?.snapshot).toMatchObject({ status: 'queued', pagesLimit: 40 });
    expect((await projects.getById(started.projectId))?.ownerId).toBeNull();
    expect(started.position).toBe(1);
  });

  it('queues past the ceiling of the queue: it is the API that is capped', async () => {
    const { queueAudit, clock } = build();
    for (let index = 0; index < 20; index += 1) {
      clock.advance(1000);
      await queueAudit.execute({ url: `https://site-${String(index)}.exemple.com/`, limit: 5 });
    }

    clock.advance(1000);
    const started = await queueAudit.execute({ url: URL_TO_AUDIT, limit: 5 });

    expect(started.position).toBe(21);
  });
});

class RecordingSleeper implements Sleeper {
  readonly delays: number[] = [];
  constructor(private readonly onSleep: () => Promise<void>) {}

  async sleep(ms: number): Promise<void> {
    this.delays.push(ms);
    await this.onSleep();
  }
}

describe('AwaitAudit', () => {
  it('polls every 2 s, reports the progress and returns the final status', async () => {
    const { snapshots, queueAudit } = build();
    const { snapshotId } = await queueAudit.execute({ url: URL_TO_AUDIT, limit: 10 });
    const claimed = await snapshots.claimNext('w', new Date());
    let polls = 0;
    const sleeper = new RecordingSleeper(async () => {
      polls += 1;
      if (claimed === null) return;
      if (polls === 1) await snapshots.heartbeat(snapshotId, claimed.attempts, 4, new Date());
      else await snapshots.failAttempt(snapshotId, claimed.attempts, new Date());
    });
    const progress: string[] = [];

    const status = await new AwaitAudit(snapshots, sleeper).execute(
      snapshotId,
      (crawled, limit) => {
        progress.push(`${String(crawled)}/${String(limit)}`);
      },
    );

    expect(status).toBe('failed');
    expect(sleeper.delays).toEqual([2000, 2000]);
    expect(progress).toEqual(['0/10', '4/10']);
  });

  it('returns at once for an audit that is already over', async () => {
    const { snapshots, queueAudit } = build();
    const { snapshotId } = await queueAudit.execute({ url: URL_TO_AUDIT, limit: 10 });
    const claimed = await snapshots.claimNext('w', new Date());
    await snapshots.finishAttempt(snapshotId, claimed?.attempts ?? 0, {
      finishedAt: new Date(),
      pagesCrawled: 1,
    });
    const sleeper = new RecordingSleeper(() => Promise.resolve());

    expect(await new AwaitAudit(snapshots, sleeper).execute(snapshotId, () => undefined)).toBe(
      'finished',
    );
    expect(sleeper.delays).toEqual([]);
  });
});
