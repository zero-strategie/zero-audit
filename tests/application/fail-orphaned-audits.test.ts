import { describe, expect, it } from 'vitest';
import { FailOrphanedAudits } from '../../src/application/fail-orphaned-audits.js';
import { ORPHAN_AUDIT_MAX_AGE_MS } from '../../src/domain/snapshot.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';

const NOW = 1_700_000_000_000;

describe('FailOrphanedAudits', () => {
  it('fails only the running snapshots older than the orphan age', async () => {
    const projects = new InMemoryProjectRepository();
    const snapshots = new InMemorySnapshotRepository();
    const project = await projects.findOrCreateByRootUrl({
      ownerId: null,
      rootUrl: 'https://exemple.com/',
      createdAt: new Date(NOW),
    });
    const start = (ageMs: number) =>
      snapshots.create({
        launchedBy: null,
        projectId: project.id,
        pagesLimit: 100,
        startedAt: new Date(NOW - ageMs),
      });
    const old = await start(ORPHAN_AUDIT_MAX_AGE_MS + 1);
    const recent = await start(ORPHAN_AUDIT_MAX_AGE_MS - 1);

    const failed = await new FailOrphanedAudits(snapshots, { now: () => NOW }).execute();

    expect(failed).toBe(1);
    expect((await snapshots.getById(old.id))?.snapshot.status).toBe('failed');
    expect((await snapshots.getById(recent.id))?.snapshot.status).toBe('running');
  });
});
