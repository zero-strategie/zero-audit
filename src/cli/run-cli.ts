import { AuditRunner } from '../application/audit-runner.js';
import { FailOrphanedAudits } from '../application/fail-orphaned-audits.js';
import { CompareSnapshots } from '../application/compare-snapshots.js';
import { GetSnapshotReport } from '../application/get-snapshot-report.js';
import {
  SnapshotNotFinished,
  SnapshotNotFound,
  SnapshotsFromDifferentProjects,
} from '../domain/errors.js';
import { allChecks } from '../domain/checks/index.js';
import { RandomTokenGenerator } from '../infrastructure/crypto/random-token-generator.js';
import { ScryptPasswordHasher } from '../infrastructure/crypto/scrypt-password-hasher.js';
import { JsonLinesAuditEvents } from '../infrastructure/json-lines-audit-events.js';
import { DnsHostResolver } from '../infrastructure/dns-host-resolver.js';
import { SystemClock } from '../infrastructure/system-clock.js';
import { buildServer, type HttpServer, type ServerDependencies } from '../http/server.js';
import {
  parseCommand,
  type AuditConfig,
  type CompareConfig,
  type MigrateConfig,
  type ServeConfig,
} from './config.js';
import { CONSOLE_MAILER_WARNING, createMailer } from './mailer-factory.js';
import { createRunAudit } from './audit-factory.js';
import { writeJsonExport } from './json-export.js';
import { ProgressReporter } from './progress-reporter.js';
import { renderComparison } from './render-compare.js';
import { renderSummary } from './render-summary.js';
import {
  createStorage,
  migrateStorage,
  type Storage,
  type StorageFactory,
} from './storage-factory.js';
import { USAGE } from './usage.js';

/** Where the dashboard listens locally: links in e-mails point there when no public URL is set. */
const DEFAULT_PUBLIC_URL = 'http://127.0.0.1:4321';

export const EXIT_SUCCESS = 0;
export const EXIT_CRAWL_FAILED = 1;
export const EXIT_USAGE = 2;

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  stderrIsTty: boolean;
}

export interface CliHooks {
  /** Lets the process entry point release the storage on SIGINT. */
  onStorageOpened?(storage: Storage): void;
  /** Lets the process entry point mark the snapshot failed on SIGINT. */
  onAuditStarted?(snapshotId: string, rootUrl: string): void;
  /** Lets the process entry point stop the background audit on SIGINT / SIGTERM. */
  onAuditRunnerStarted?(runner: AuditRunner): void;
  /** Lets the process entry point stop the server on SIGINT. */
  onServerStarted?(server: HttpServer): void;
  /** Builds the HTTP server; defaults to the Fastify API. */
  createServer?(dependencies: ServerDependencies): HttpServer;
  /** Resolves when `serve` must stop; defaults to never (the process is stopped by a signal). */
  untilStopped?: Promise<void>;
  /** Composition root override; defaults to the real SQLite / Postgres factory. */
  storageFactory?: StorageFactory;
}

const labelsById = (): ReadonlyMap<number, string> =>
  new Map(allChecks.map((check) => [check.id, check.label]));

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const audit = async (config: AuditConfig, io: CliIo, hooks: CliHooks): Promise<number> => {
  const progress = new ProgressReporter((text) => {
    io.stderr(text);
  }, io.stderrIsTty);
  let storage: Storage | null = null;
  try {
    const opened = await (hooks.storageFactory ?? createStorage)(config);
    storage = opened;
    hooks.onStorageOpened?.(opened);
    const clock = new SystemClock();
    const runAudit = createRunAudit({
      storage: opened,
      events: new JsonLinesAuditEvents(
        {
          write: (text) => {
            io.stdout(text);
          },
        },
        clock,
      ),
      blockPrivateAddresses: false,
    });
    const details = await runAudit.execute({
      rootUrl: config.rootUrl,
      limit: config.limit,
      delayMs: config.delayMs,
      onProgress: (crawled, limit) => {
        progress.update(crawled, limit);
      },
      onSnapshotCreated: (id) => {
        hooks.onAuditStarted?.(id, config.rootUrl);
      },
    });
    progress.finish();
    const report = await new GetSnapshotReport(opened.snapshots, opened.projects).execute(
      details.snapshot.id,
    );
    io.stdout(renderSummary(report, labelsById()));
    if (config.jsonPath !== null) writeJsonExport(config.jsonPath, report);
    return EXIT_SUCCESS;
  } catch (error) {
    progress.finish();
    io.stderr(`Audit échoué : ${errorMessage(error)}\n`);
    return EXIT_CRAWL_FAILED;
  } finally {
    await storage?.close();
  }
};

const migrate = async (config: MigrateConfig, io: CliIo): Promise<number> => {
  try {
    await migrateStorage(config);
    io.stdout('Migrations appliquées.\n');
    return EXIT_SUCCESS;
  } catch (error) {
    io.stderr(`Migration échouée : ${errorMessage(error)}\n`);
    return EXIT_CRAWL_FAILED;
  }
};

const serve = async (config: ServeConfig, io: CliIo, hooks: CliHooks): Promise<number> => {
  let storage: Storage | null = null;
  let server: HttpServer | null = null;
  let runner: AuditRunner | null = null;
  try {
    if (config.mail.kind === 'console') io.stderr(`Avertissement, ${CONSOLE_MAILER_WARNING}\n`);
    const opened = await (hooks.storageFactory ?? createStorage)(config);
    storage = opened;
    hooks.onStorageOpened?.(opened);
    const clock = new SystemClock();
    await new FailOrphanedAudits(opened.snapshots, clock).execute();
    const logger = {
      info: (message: string) => {
        io.stderr(`${message}\n`);
      },
      error: (message: string) => {
        io.stderr(`${message}\n`);
      },
    };
    runner = new AuditRunner({
      createRunAudit: (events) =>
        createRunAudit({
          storage: opened,
          events,
          blockPrivateAddresses: !config.allowPrivateTargets,
        }),
      snapshots: opened.snapshots,
      projects: opened.projects,
      clock,
      logger,
      delayMs: config.delayMs,
    });
    hooks.onAuditRunnerStarted?.(runner);
    server = (hooks.createServer ?? buildServer)({
      projects: storage.projects,
      snapshots: storage.snapshots,
      health: storage.health,
      auditRunner: runner,
      hostResolver: new DnsHostResolver(),
      allowPrivateTargets: config.allowPrivateTargets,
      users: opened.users,
      sessions: opened.sessions,
      emailTokens: opened.emailTokens,
      passwordHasher: new ScryptPasswordHasher(),
      mailer: createMailer(config.mail, logger, (text) => {
        io.stderr(text);
      }),
      tokenGenerator: new RandomTokenGenerator(),
      clock,
      publicUrl: config.mail.publicUrl ?? DEFAULT_PUBLIC_URL,
      adminEmails: config.adminEmails,
    });
    hooks.onServerStarted?.(server);
    await server.listen({ host: config.host, port: config.port });
    io.stdout(`API à l'écoute sur http://${config.host}:${String(config.port)}\n`);
    await (hooks.untilStopped ?? new Promise<never>(() => undefined));
    return EXIT_SUCCESS;
  } catch (error) {
    io.stderr(`Démarrage du serveur échoué : ${errorMessage(error)}\n`);
    return EXIT_CRAWL_FAILED;
  } finally {
    await server?.close();
    await runner?.stop();
    await storage?.close();
  }
};

const compareFailureMessage = (error: unknown, { baseId, targetId }: CompareConfig): string => {
  if (error instanceof SnapshotNotFound) return `Snapshot introuvable : ${error.message}`;
  if (error instanceof SnapshotsFromDifferentProjects) {
    return `Les snapshots ${baseId} et ${targetId} ne sont pas du même site.`;
  }
  if (error instanceof SnapshotNotFinished) return `Snapshot pas terminé : ${error.message}`;
  return `Comparaison échouée : ${error instanceof Error ? error.message : String(error)}`;
};

const compare = async (config: CompareConfig, io: CliIo, hooks: CliHooks): Promise<number> => {
  let storage: Storage | null = null;
  try {
    storage = await (hooks.storageFactory ?? createStorage)(config);
    hooks.onStorageOpened?.(storage);
    const comparison = await new CompareSnapshots(storage.snapshots).execute(
      config.baseId,
      config.targetId,
    );
    io.stdout(renderComparison(comparison, labelsById()));
    return EXIT_SUCCESS;
  } catch (error) {
    io.stderr(`${compareFailureMessage(error, config)}\n`);
    return EXIT_CRAWL_FAILED;
  } finally {
    await storage?.close();
  }
};

export const runCli = async (
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  io: CliIo,
  hooks: CliHooks = {},
): Promise<number> => {
  const command = parseCommand(argv, env);
  if (command.kind === 'help') {
    io.stdout(USAGE);
    return EXIT_SUCCESS;
  }
  if (command.kind === 'usage-error') {
    io.stderr(`Erreur : ${command.message}\n\n${USAGE}`);
    return EXIT_USAGE;
  }
  if (command.kind === 'migrate') return migrate(command, io);
  if (command.kind === 'serve') return serve(command, io, hooks);
  if (command.kind === 'compare') return compare(command, io, hooks);
  return audit(command.config, io, hooks);
};
