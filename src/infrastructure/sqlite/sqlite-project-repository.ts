import type { Database as SqliteDatabase } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ProjectRepository } from '../../application/ports/project-repository.js';
import type { Project } from '../../domain/project.js';

interface ProjectRow {
  id: string;
  root_url: string;
  created_at: string;
}

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  rootUrl: row.root_url,
  createdAt: new Date(row.created_at),
});

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: SqliteDatabase) {}

  findOrCreateByRootUrl(input: { rootUrl: string; createdAt: Date }): Promise<Project> {
    return this.run(() =>
      this.db.transaction((): Project => {
        const existing = this.db
          .prepare('SELECT * FROM projects WHERE root_url = ?')
          .get(input.rootUrl) as ProjectRow | undefined;
        if (existing) return toProject(existing);
        const project: Project = { id: randomUUID(), ...input };
        this.db
          .prepare('INSERT INTO projects (id, root_url, created_at) VALUES (?, ?, ?)')
          .run(project.id, project.rootUrl, project.createdAt.toISOString());
        return project;
      })(),
    );
  }

  list(): Promise<readonly Project[]> {
    return this.run(() =>
      (this.db.prepare('SELECT * FROM projects ORDER BY created_at, id').all() as ProjectRow[]).map(
        toProject,
      ),
    );
  }

  getById(id: string): Promise<Project | null> {
    return this.run(() => {
      const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
        ProjectRow | undefined;
      return row ? toProject(row) : null;
    });
  }

  private run<T>(operation: () => T): Promise<T> {
    try {
      return Promise.resolve(operation());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
