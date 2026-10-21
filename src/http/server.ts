import Fastify, { type FastifyInstance } from 'fastify';
import { ConfirmPasswordReset } from '../application/auth/confirm-password-reset.js';
import { DeleteAccount } from '../application/auth/delete-account.js';
import { GetCurrentAccount } from '../application/auth/get-current-account.js';
import { Login } from '../application/auth/login.js';
import { Logout } from '../application/auth/logout.js';
import { OpenSession } from '../application/auth/open-session.js';
import { RegisterAccount } from '../application/auth/register-account.js';
import { RequestPasswordReset } from '../application/auth/request-password-reset.js';
import { ResendVerification } from '../application/auth/resend-verification.js';
import { ResolveReader } from '../application/auth/resolve-reader.js';
import { ResolveSession } from '../application/auth/resolve-session.js';
import { SendVerificationLink } from '../application/auth/send-verification-link.js';
import { VerifyEmail } from '../application/auth/verify-email.js';
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
import type { AccountEraser } from '../application/ports/account-eraser.js';
import type { Clock } from '../application/ports/clock.js';
import type { EmailTokenRepository } from '../application/ports/email-token-repository.js';
import type { HostResolver } from '../application/ports/host-resolver.js';
import type { Mailer } from '../application/ports/mailer.js';
import type { PasswordHasher } from '../application/ports/password-hasher.js';
import type { RateLimiter } from '../application/ports/rate-limiter.js';
import type { SessionRepository } from '../application/ports/session-repository.js';
import type { TokenGenerator } from '../application/ports/token-generator.js';
import type { UserRepository } from '../application/ports/user-repository.js';
import type { StorageHealth } from '../application/ports/storage-health.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { SnapshotRepository } from '../application/ports/snapshot-repository.js';
import { allChecks } from '../domain/checks/index.js';
import { registerErrorHandlers } from './errors.js';
import { buildReaderOf } from './reader.js';
import { registerAuditRoutes } from './routes/audits.js';
import { registerAuthRoutes, type AuthUseCases } from './routes/auth.js';
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
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly emailTokens: EmailTokenRepository;
  readonly passwordHasher: PasswordHasher;
  readonly mailer: Mailer;
  readonly tokenGenerator: TokenGenerator;
  readonly clock: Clock;
  readonly rateLimiter: RateLimiter;
  readonly eraser: AccountEraser;
  /** Base of the links sent by e-mail, without trailing slash. */
  readonly publicUrl: string;
  /** Administrator addresses, normalized with `normalizeEmail`. */
  readonly adminEmails: readonly string[];
}

/** What the process entry point needs from the server: start it and stop it. */
export interface HttpServer {
  listen(options: { host: string; port: number }): Promise<unknown>;
  close(): Promise<void>;
}

const buildAuthUseCases = (dependencies: ServerDependencies): AuthUseCases => {
  const { users, sessions, passwordHasher, mailer, clock, adminEmails, rateLimiter } = dependencies;
  const sendVerificationLink = new SendVerificationLink(dependencies);
  const openSession = new OpenSession(dependencies);
  const resolveSession = new ResolveSession(dependencies);
  return {
    registerAccount: new RegisterAccount({
      users,
      passwordHasher,
      mailer,
      clock,
      sendVerificationLink,
      rateLimiter,
    }),
    resendVerification: new ResendVerification({ users, mailer, sendVerificationLink }),
    verifyEmail: new VerifyEmail({ ...dependencies, openSession }),
    login: new Login({ users, passwordHasher, openSession, rateLimiter }),
    logout: new Logout({ resolveSession, sessions }),
    getCurrentAccount: new GetCurrentAccount({ resolveSession, adminEmails }),
    requestPasswordReset: new RequestPasswordReset(dependencies),
    confirmPasswordReset: new ConfirmPasswordReset(dependencies),
    deleteAccount: new DeleteAccount({ ...dependencies, resolveSession }),
  };
};

/** Builds the API without listening, so that tests can use `inject()`. */
export const buildServer = (dependencies: ServerDependencies): FastifyInstance => {
  const { projects, snapshots, health, auditRunner, hostResolver, allowPrivateTargets } =
    dependencies;
  const app = Fastify();
  const readerOf = buildReaderOf(
    new ResolveReader({
      resolveSession: new ResolveSession(dependencies),
      adminEmails: dependencies.adminEmails,
    }),
  );
  registerErrorHandlers(app);
  registerAuthRoutes(app, buildAuthUseCases(dependencies));
  registerProjectRoutes(
    app,
    {
      listProjects: new ListProjects(projects, snapshots),
      listProjectSnapshots: new ListProjectSnapshots(projects, snapshots),
    },
    readerOf,
  );
  registerSnapshotRoutes(
    app,
    {
      getSnapshotReport: new GetSnapshotReport(snapshots, projects),
      getAuditProgress: new GetAuditProgress(auditRunner, snapshots, projects),
    },
    readerOf,
  );
  registerAuditRoutes(app, {
    launchAudit: new LaunchAudit(auditRunner, hostResolver, allowPrivateTargets),
  });
  registerIssueRoutes(
    app,
    {
      listIssues: new ListIssues(snapshots, projects, allChecks),
      listOccurrences: new ListOccurrences(snapshots, projects, allChecks),
    },
    readerOf,
  );
  registerPageRoutes(app, { listPages: new ListPages(snapshots, projects) }, readerOf);
  registerCompareRoutes(
    app,
    { compareSnapshots: new CompareSnapshots(snapshots, projects) },
    readerOf,
  );
  registerCheckRoutes(app, allChecks);
  registerHealthRoutes(app, { checkHealth: new CheckHealth(health) });
  return app;
};
