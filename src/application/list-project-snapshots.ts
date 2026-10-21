import { ProjectNotFound } from '../domain/errors.js';
import { canRead, type Reader } from '../domain/reader.js';
import type { Snapshot } from '../domain/snapshot.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';
import { healthOf } from './snapshot-health.js';

export interface SnapshotListing {
  readonly snapshot: Snapshot;
  readonly health: number | null;
}

export class ListProjectSnapshots {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly snapshots: SnapshotRepository,
  ) {}

  /** Most recent first. */
  async execute(reader: Reader, projectId: string): Promise<SnapshotListing[]> {
    const project = await this.projects.getById(projectId);
    if (!project || !canRead(reader, project)) throw new ProjectNotFound(projectId);
    const snapshots = await this.snapshots.listByProject(projectId);
    return Promise.all(
      snapshots.map(async (snapshot) => ({
        snapshot,
        health: await healthOf(this.snapshots, snapshot),
      })),
    );
  }
}
