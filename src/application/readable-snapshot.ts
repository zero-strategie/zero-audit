import { SnapshotNotFound } from '../domain/errors.js';
import type { Project } from '../domain/project.js';
import { canRead, type Reader } from '../domain/reader.js';
import type { ProjectRepository } from './ports/project-repository.js';
import type { SnapshotDetails, SnapshotRepository } from './ports/snapshot-repository.js';

export interface ReadableSnapshot {
  readonly details: SnapshotDetails;
  readonly project: Project;
}

/**
 * A snapshot the reader may not see is reported exactly like a missing one, so that the response
 * never reveals that someone else's snapshot exists.
 */
export const loadReadableSnapshot = async (
  snapshots: SnapshotRepository,
  projects: ProjectRepository,
  reader: Reader,
  snapshotId: string,
): Promise<ReadableSnapshot> => {
  const details = await snapshots.getById(snapshotId);
  if (!details) throw new SnapshotNotFound(snapshotId);
  const project = await projects.getById(details.snapshot.projectId);
  if (!project || !canRead(reader, project)) throw new SnapshotNotFound(snapshotId);
  return { details, project };
};
