import type { Project } from '../../domain/project.js';

export interface ProjectRepository {
  /** `rootUrl` must already be normalized; `createdAt` is only used when the project is created. */
  findOrCreateByRootUrl(input: { rootUrl: string; createdAt: Date }): Promise<Project>;
  list(): Promise<readonly Project[]>;
  getById(id: string): Promise<Project | null>;
}
