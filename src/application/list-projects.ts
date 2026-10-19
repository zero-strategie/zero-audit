import type { Project } from '../domain/project.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';
import { healthOf } from './snapshot-health.js';

export interface LatestFinishedSnapshot {
  readonly id: string;
  readonly finishedAt: Date | null;
  readonly health: number | null;
}

export interface ProjectOverview {
  readonly project: Project;
  readonly latestSnapshot: LatestFinishedSnapshot | null;
}

export class ListProjects {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly snapshots: SnapshotRepository,
  ) {}

  async execute(): Promise<ProjectOverview[]> {
    const projects = await this.projects.list();
    return Promise.all(projects.map((project) => this.overview(project)));
  }

  private async overview(project: Project): Promise<ProjectOverview> {
    const snapshots = await this.snapshots.listByProject(project.id);
    const latest = snapshots.find(({ status }) => status === 'finished');
    if (!latest) return { project, latestSnapshot: null };
    return {
      project,
      latestSnapshot: {
        id: latest.id,
        finishedAt: latest.finishedAt,
        health: await healthOf(this.snapshots, latest),
      },
    };
  }
}
