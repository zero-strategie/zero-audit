import type { Project } from '../domain/project.js';
import type { SnapshotStatus } from '../domain/snapshot.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';
import { healthOf } from './snapshot-health.js';

export interface LatestFinishedSnapshot {
  readonly id: string;
  readonly finishedAt: Date | null;
  readonly health: number | null;
}

export interface LatestRun {
  readonly id: string;
  readonly status: SnapshotStatus;
  readonly startedAt: Date;
}

export interface ProjectOverview {
  readonly project: Project;
  readonly latestSnapshot: LatestFinishedSnapshot | null;
  /** The most recent snapshot, whatever its status. */
  readonly latestRun: LatestRun | null;
}

export class ListProjects {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly snapshots: SnapshotRepository,
  ) {}

  async execute(): Promise<ProjectOverview[]> {
    const projects = await this.projects.list(null);
    return Promise.all(projects.map((project) => this.overview(project)));
  }

  private async overview(project: Project): Promise<ProjectOverview> {
    const snapshots = await this.snapshots.listByProject(project.id);
    const [mostRecent] = snapshots;
    const latestRun = mostRecent
      ? { id: mostRecent.id, status: mostRecent.status, startedAt: mostRecent.startedAt }
      : null;
    const latest = snapshots.find(({ status }) => status === 'finished');
    if (!latest) return { project, latestSnapshot: null, latestRun };
    return {
      project,
      latestRun,
      latestSnapshot: {
        id: latest.id,
        finishedAt: latest.finishedAt,
        health: await healthOf(this.snapshots, latest),
      },
    };
  }
}
