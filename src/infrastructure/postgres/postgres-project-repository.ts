import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { ProjectRepository } from '../../application/ports/project-repository.js';
import type { Project } from '../../domain/project.js';

type ProjectRow = {
  id: string;
  root_url: string;
  created_at: Date;
};

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  rootUrl: row.root_url,
  createdAt: row.created_at,
});

export class PostgresProjectRepository implements ProjectRepository {
  constructor(private readonly pool: pg.Pool) {}

  async findOrCreateByRootUrl(input: { rootUrl: string; createdAt: Date }): Promise<Project> {
    const inserted = await this.pool.query<ProjectRow>(
      `INSERT INTO projects (id, root_url, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (root_url) DO NOTHING RETURNING *`,
      [randomUUID(), input.rootUrl, input.createdAt],
    );
    if (inserted.rows[0]) return toProject(inserted.rows[0]);
    const existing = await this.pool.query<ProjectRow>(
      'SELECT * FROM projects WHERE root_url = $1',
      [input.rootUrl],
    );
    return toProject(existing.rows[0] as ProjectRow);
  }

  async list(): Promise<readonly Project[]> {
    const { rows } = await this.pool.query<ProjectRow>(
      'SELECT * FROM projects ORDER BY created_at, id',
    );
    return rows.map(toProject);
  }

  async getById(id: string): Promise<Project | null> {
    const { rows } = await this.pool.query<ProjectRow>('SELECT * FROM projects WHERE id = $1', [
      id,
    ]);
    return rows[0] ? toProject(rows[0]) : null;
  }
}
