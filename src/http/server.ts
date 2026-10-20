import Fastify, { type FastifyInstance } from 'fastify';
import type { AuditRunner } from '../application/audit-runner.js';
import { CheckHealth } from '../application/check-health.js';
import { CompareSnapshots } from '../application/compare-snapshots.js';
import { GetAuditProgress } from '../application/get-audit-progress.js';
import { GetSnapshotReport } from '../application/get-snapshot-report.js';
import { LaunchAudit } from '../application/launch-audit.js';
import { ListIssues } from '../application/list-issues.js';
import { ListOccurrences } from '../application/list-occurrences.js';
import { ListPages } from '../application/list-pages.js';
import { ListProjectSnapshots } from '../application/list-project-snapshots.js';
import { ListProjects } from '../application/list-projects.js';
import type { HostResolver } from '../application/ports/host-resolver.js';
import type { StorageHealth } from '../application/ports/storage-health.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { SnapshotRepository } from '../application/ports/snapshot-repository.js';
import { allChecks } from '../domain/checks/index.js';
import { registerErrorHandlers } from './errors.js';
import { registerAuditRoutes } from './routes/audits.js';
import { registerCheckRoutes } from './routes/checks.js';
import { registerCompareRoutes } from './routes/compare.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerIssueRoutes } from './routes/issues.js';
import { registerPageRoutes } from './routes/pages.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerSnapshotRoutes } from './routes/snapshots.js';

export interface ServerDependencies {
  readonly projects: ProjectRepository;
  readonly snapshots: SnapshotRepository;
  readonly health: StorageHealth;
  readonly auditRunner: Pick<AuditRunner, 'start' | 'progress'>;
  readonly hostResolver: HostResolver;
  /** Turns the SSRF pre-check of `POST /audits` off (`ZERO_AUDIT_ALLOW_PRIVATE_TARGETS`). */
  readonly allowPrivateTargets: boolean;
}

/** What the process entry point needs from the server: start it and stop it. */
export interface HttpServer {
  listen(options: { host: string; port: number }): Promise<unknown>;
  close(): Promise<void>;
}

/** Builds the API without listening, so that tests can use `inject()`. */
export const buildServer = ({
  projects,
  snapshots,
  health,
  auditRunner,
  hostResolver,
  allowPrivateTargets,
}: ServerDependencies): FastifyInstance => {
  const app = Fastify();
  registerErrorHandlers(app);
  registerProjectRoutes(app, {
    listProjects: new ListProjects(projects, snapshots),
    listProjectSnapshots: new ListProjectSnapshots(projects, snapshots),
  });
  registerSnapshotRoutes(app, {
    getSnapshotReport: new GetSnapshotReport(snapshots, projects),
    getAuditProgress: new GetAuditProgress(auditRunner),
  });
  registerAuditRoutes(app, {
    launchAudit: new LaunchAudit(auditRunner, hostResolver, allowPrivateTargets),
  });
  registerIssueRoutes(app, {
    listIssues: new ListIssues(snapshots, allChecks),
    listOccurrences: new ListOccurrences(snapshots, allChecks),
  });
  registerPageRoutes(app, { listPages: new ListPages(snapshots) });
  registerCompareRoutes(app, { compareSnapshots: new CompareSnapshots(snapshots) });
  registerCheckRoutes(app, allChecks);
  registerHealthRoutes(app, { checkHealth: new CheckHealth(health) });
  return app;
};
