import { describe, expect, it } from 'vitest';
import { ListProjects } from '../../src/application/list-projects.js';
import { ListProjectSnapshots } from '../../src/application/list-project-snapshots.js';
import type { CheckResult } from '../../src/domain/check.js';
import { ProjectNotFound } from '../../src/domain/errors.js';
import { InMemoryProjectRepository } from '../../src/infrastructure/in-memory-project-repository.js';
import { InMemorySnapshotRepository } from '../../src/infrastructure/in-memory-snapshot-repository.js';

const minutes = (n: number): Date => new Date(Date.UTC(2026, 0, 1, 10, n));

const flagged = (count: number): CheckResult => ({
  checkId: 15,
  severity: 'warning',
  theme: 'on-page',
  count,
  examined: 5,
  occurrences: [],
});

const build = async () => {
  const projects = new InMemoryProjectRepository();
  const snapshots = new InMemorySnapshotRepository();
  const project = await projects.findOrCreateByRootUrl({
    ownerId: null,
    rootUrl: 'https://e.com/',
    createdAt: minutes(0),
  });
  const record = async (
    startMinute: number,
    outcome: 'finished' | 'failed' | 'running',
    failing = 0,
  ): Promise<string> => {
    const { id } = await snapshots.create({
      launchedBy: null,
      projectId: project.id,
      pagesLimit: 10,
      startedAt: minutes(startMinute),
    });
    await snapshots.addCheckResults(id, [flagged(failing)]);
    if (outcome === 'finished') {
      await snapshots.finish(id, { finishedAt: minutes(startMinute + 1), pagesCrawled: 1 });
    }
    if (outcome === 'failed') await snapshots.fail(id, minutes(startMinute + 1));
    return id;
  };
  return { projects, snapshots, project, record };
};

describe('ListProjects', () => {
  it('returns an empty list without any project', async () => {
    const empty = new ListProjects(
      new InMemoryProjectRepository(),
      new InMemorySnapshotRepository(),
    );

    expect(await empty.execute()).toEqual([]);
  });

  it('gives the latest finished snapshot with its rounded health', async () => {
    const { projects, snapshots, record } = await build();
    await record(0, 'finished', 5);
    const latest = await record(10, 'finished', 1);
    await record(20, 'failed');
    await record(30, 'running');

    const [listed] = await new ListProjects(projects, snapshots).execute();

    expect(listed?.latestSnapshot).toEqual({ id: latest, finishedAt: minutes(11), health: 80 });
  });

  it('gives the most recent snapshot as latest run, whatever its status', async () => {
    const { projects, snapshots, record } = await build();
    await record(0, 'finished', 1);
    const running = await record(30, 'running');

    const [listed] = await new ListProjects(projects, snapshots).execute();

    expect(listed?.latestRun).toEqual({ id: running, status: 'running', startedAt: minutes(30) });
  });

  it('has no latest run for a project without snapshot', async () => {
    const { projects, snapshots, project } = await build();

    const [listed] = await new ListProjects(projects, snapshots).execute();

    expect(listed).toEqual({ project, latestSnapshot: null, latestRun: null });
  });

  it('has no latest snapshot for a project without finished snapshot', async () => {
    const { projects, snapshots, record } = await build();
    await record(0, 'failed');

    const [listed] = await new ListProjects(projects, snapshots).execute();

    expect(listed?.latestSnapshot).toBeNull();
  });
});

describe('ListProjectSnapshots', () => {
  it('lists the snapshots, most recent first, with a health only when finished', async () => {
    const { projects, snapshots, project, record } = await build();
    const first = await record(0, 'finished', 1);
    const second = await record(10, 'failed');
    const third = await record(20, 'finished', 5);

    const listed = await new ListProjectSnapshots(projects, snapshots).execute(project.id);

    expect(listed.map(({ snapshot, health }) => [snapshot.id, snapshot.status, health])).toEqual([
      [third, 'finished', 0],
      [second, 'failed', null],
      [first, 'finished', 80],
    ]);
  });

  it('throws ProjectNotFound for an unknown project', async () => {
    const { projects, snapshots } = await build();

    await expect(
      new ListProjectSnapshots(projects, snapshots).execute('missing'),
    ).rejects.toBeInstanceOf(ProjectNotFound);
  });
});
