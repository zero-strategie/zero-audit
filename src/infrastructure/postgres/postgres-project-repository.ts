import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { ProjectRepository } from '../../application/ports/project-repository.js';
import type { Project } from '../../domain/project.js';

type ProjectRow = {
  id: string;
  root_url: string;
  owner_id: string | null;
  created_at: Date;
};

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  rootUrl: row.root_url,
  ownerId: row.owner_id,
  createdAt: row.created_at,
});

/** Each arbiter matches one of the two partial unique indexes of migration 004. */
const PUBLIC_CONFLICT = 'ON CONFLICT (root_url) WHERE owner_id IS NULL';
const OWNED_CONFLICT = 'ON CONFLICT (owner_id, root_url) WHERE owner_id IS NOT NULL';

export class PostgresProjectRepository implements ProjectRepository {
  constructor(private readonly pool: pg.Pool) {}

  async findOrCreateByRootUrl(input: {
    rootUrl: string;
    ownerId: string | null;
    createdAt: Date;
  }): Promise<Project> {
    const inserted = await this.pool.query<ProjectRow>(
      `INSERT INTO projects (id, root_url, owner_id, created_at) VALUES ($1, $2, $3, $4)
       ${input.ownerId === null ? PUBLIC_CONFLICT : OWNED_CONFLICT} DO NOTHING RETURNING *`,
      [randomUUID(), input.rootUrl, input.ownerId, input.createdAt],
    );
    if (inserted.rows[0]) return toProject(inserted.rows[0]);
    const existing = await this.pool.query<ProjectRow>(
      'SELECT * FROM projects WHERE root_url = $1 AND owner_id IS NOT DISTINCT FROM $2',
      [input.rootUrl, input.ownerId],
    );
    return toProject(existing.rows[0] as ProjectRow);
  }

  async list(readerId: string | null): Promise<readonly Project[]> {
    const { rows } = await this.pool.query<ProjectRow>(
      'SELECT * FROM projects WHERE owner_id IS NULL OR owner_id = $1 ORDER BY created_at, id',
      [readerId],
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
