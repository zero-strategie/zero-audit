import type { Database as SqliteDatabase } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ProjectRepository } from '../../application/ports/project-repository.js';
import type { Project } from '../../domain/project.js';

interface ProjectRow {
  id: string;
  root_url: string;
  owner_id: string | null;
  created_at: string;
}

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  rootUrl: row.root_url,
  ownerId: row.owner_id,
  createdAt: new Date(row.created_at),
});

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: SqliteDatabase) {}

  findOrCreateByRootUrl(input: {
    rootUrl: string;
    ownerId: string | null;
    createdAt: Date;
  }): Promise<Project> {
    return this.run(() =>
      this.db.transaction((): Project => {
        const existing = this.db
          .prepare('SELECT * FROM projects WHERE root_url = ? AND owner_id IS ?')
          .get(input.rootUrl, input.ownerId) as ProjectRow | undefined;
        if (existing) return toProject(existing);
        const project: Project = { id: randomUUID(), ...input };
        this.db
          .prepare('INSERT INTO projects (id, root_url, owner_id, created_at) VALUES (?, ?, ?, ?)')
          .run(project.id, project.rootUrl, project.ownerId, project.createdAt.toISOString());
        return project;
      })(),
    );
  }

  list(readerId: string | null): Promise<readonly Project[]> {
    return this.run(() =>
      (
        this.db
          .prepare(
            'SELECT * FROM projects WHERE owner_id IS NULL OR owner_id = ? ORDER BY created_at, id',
          )
          .all(readerId) as ProjectRow[]
      ).map(toProject),
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
