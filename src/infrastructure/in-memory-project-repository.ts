import { randomUUID } from 'node:crypto';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { Project } from '../domain/project.js';

export class InMemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Project>();

  findOrCreateByRootUrl(input: { rootUrl: string; createdAt: Date }): Promise<Project> {
    const existing = [...this.projects.values()].find(({ rootUrl }) => rootUrl === input.rootUrl);
    if (existing) return Promise.resolve(existing);
    const project: Project = { id: randomUUID(), ...input };
    this.projects.set(project.id, project);
    return Promise.resolve(project);
  }

  list(): Promise<readonly Project[]> {
    return Promise.resolve(
      [...this.projects.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    );
  }

  getById(id: string): Promise<Project | null> {
    return Promise.resolve(this.projects.get(id) ?? null);
  }
}
