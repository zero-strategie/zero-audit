import Fastify, { type FastifyInstance } from 'fastify';
import { GetSnapshotReport } from '../application/get-snapshot-report.js';
import { ListProjectSnapshots } from '../application/list-project-snapshots.js';
import { ListProjects } from '../application/list-projects.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { SnapshotRepository } from '../application/ports/snapshot-repository.js';
import { registerErrorHandlers } from './errors.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerSnapshotRoutes } from './routes/snapshots.js';

export interface ServerDependencies {
  readonly projects: ProjectRepository;
  readonly snapshots: SnapshotRepository;
}

/** What the process entry point needs from the server: start it and stop it. */
export interface HttpServer {
  listen(options: { host: string; port: number }): Promise<unknown>;
  close(): Promise<void>;
}

/** Builds the read-only API without listening, so that tests can use `inject()`. */
export const buildServer = ({ projects, snapshots }: ServerDependencies): FastifyInstance => {
  const app = Fastify();
  registerErrorHandlers(app);
  registerProjectRoutes(app, {
    listProjects: new ListProjects(projects, snapshots),
    listProjectSnapshots: new ListProjectSnapshots(projects, snapshots),
  });
  registerSnapshotRoutes(app, { getSnapshotReport: new GetSnapshotReport(snapshots) });
  return app;
};
