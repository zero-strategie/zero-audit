import type { Project } from '../../domain/project.js';

export interface ProjectRepository {
  /**
   * `rootUrl` must already be normalized; `createdAt` is only used when the project is created.
   * A project is unique per (`ownerId`, `rootUrl`); a null owner designates the showcase.
   */
  findOrCreateByRootUrl(input: {
    rootUrl: string;
    ownerId: string | null;
    createdAt: Date;
  }): Promise<Project>;
  /** The showcase projects, plus those owned by `readerId` when the reader is signed in. */
  list(readerId: string | null): Promise<readonly Project[]>;
  getById(id: string): Promise<Project | null>;
}
