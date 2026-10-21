import os from 'node:os';
import { CheckWorkerHealth } from '../application/check-worker-health.js';
import { workerIdsFor } from '../application/process-audit-queue.js';
import type { Clock } from '../application/ports/clock.js';
import { AwaitAudit } from '../application/await-audit.js';
import { QueueAudit } from '../application/queue-audit.js';
import type { Sleeper } from '../application/ports/sleeper.js';
import { RealSleeper } from '../infrastructure/real-sleeper.js';
import type { Logger } from '../application/ports/logger.js';
import { PurgeStaleAccounts } from '../application/purge-stale-accounts.js';
import { RecoverStaleAudits } from '../application/recover-stale-audits.js';
import { ANONYMOUS_READER } from '../domain/reader.js';
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
import { InMemoryRateLimiter } from '../infrastructure/rate-limit/in-memory-rate-limiter.js';
import { SystemClock } from '../infrastructure/system-clock.js';
import { buildServer, type HttpServer, type ServerDependencies } from '../http/server.js';
import {
  parseCommand,
  type AuditConfig,
  type CompareConfig,
  type MigrateConfig,
  type ServeConfig,
  type WorkerConfig,
  type WorkerHealthConfig,
} from './config.js';
import { CONSOLE_MAILER_WARNING, createMailer } from './mailer-factory.js';
import { createAuditWorker, createRunAudit } from './audit-factory.js';
import { startDailyPurge } from './daily-purge.js';
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
  /** Lets the process entry point stop the embedded worker on SIGINT / SIGTERM. */
  onWorkerStarted?(worker: { stop(): Promise<void> }): void;
  /** Lets the process entry point stop the `worker` command on SIGINT / SIGTERM. */
  onWorkerProcessStarted?(worker: { stop(): Promise<void> }): void;
  /** Lets the process entry point stop the server on SIGINT. */
  onServerStarted?(server: HttpServer): void;
  /** Builds the HTTP server; defaults to the Fastify API. */
  createServer?(dependencies: ServerDependencies): HttpServer;
  /** Resolves when `serve` must stop; defaults to never (the process is stopped by a signal). */
  untilStopped?: Promise<void>;
  /** Time source of `worker-health` and of the queued launch; defaults to the system clock. */
  clock?: Clock;
  /** Pause between two reads of the audit under `--wait`; defaults to the real timer. */
  sleeper?: Sleeper;
  /** Host name the worker announces itself with; defaults to `os.hostname()`. */
  hostname?: string;
  /** Composition root override; defaults to the real SQLite / Postgres factory. */
  storageFactory?: StorageFactory;
}

const labelsById = (): ReadonlyMap<number, string> =>
  new Map(allChecks.map((check) => [check.id, check.label]));

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const reportOn = async (
  storage: Storage,
  snapshotId: string,
  config: AuditConfig,
  io: CliIo,
): Promise<void> => {
  const report = await new GetSnapshotReport(storage.snapshots, storage.projects).execute(
    ANONYMOUS_READER,
    snapshotId,
  );
  io.stdout(renderSummary(report, labelsById()));
  if (config.jsonPath !== null) writeJsonExport(config.jsonPath, report);
};

/** The crawl runs in this process; the SSRF guard stays off, as it always did for the command line. */
const crawlInProcess = async (
  config: AuditConfig,
  storage: Storage,
  progress: ProgressReporter,
  io: CliIo,
  hooks: CliHooks,
): Promise<number> => {
  const runAudit = createRunAudit({
    storage,
    events: new JsonLinesAuditEvents(
      {
        write: (text) => {
          io.stdout(text);
        },
      },
      new SystemClock(),
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
  await reportOn(storage, details.snapshot.id, config, io);
  return EXIT_SUCCESS;
};

const WORKER_ABSENT_WARNING =
  "Avertissement : aucun worker actif sur cet hôte, l'audit reste en file tant qu'un worker ne démarre pas.\n";

/** Hands the audit to a worker; with `--wait`, follows it until it is over without ever touching it. */
const crawlInQueue = async (
  config: AuditConfig,
  storage: Storage,
  progress: ProgressReporter,
  io: CliIo,
  hooks: CliHooks,
): Promise<number> => {
  const clock = hooks.clock ?? new SystemClock();
  const queued = await new QueueAudit(storage.queue, storage.projects, clock).execute({
    url: config.rootUrl,
    limit: config.limit,
  });
  io.stdout(`Audit ${queued.snapshotId} mis en file (position ${String(queued.position)}).\n`);
  if (config.mode !== 'wait') return EXIT_SUCCESS;

  const workerIds = workerIdsFor(hooks.hostname ?? os.hostname(), config.workerConcurrency);
  if (!(await new CheckWorkerHealth(storage.queue, clock).execute(workerIds))) {
    io.stderr(WORKER_ABSENT_WARNING);
  }
  const status = await new AwaitAudit(
    storage.snapshots,
    hooks.sleeper ?? new RealSleeper(),
  ).execute(queued.snapshotId, (crawled, limit) => {
    progress.update(crawled, limit);
  });
  progress.finish();
  if (status === 'failed') {
    io.stderr(`Audit échoué : l'audit ${queued.snapshotId} s'est terminé en échec.\n`);
    return EXIT_CRAWL_FAILED;
  }
  await reportOn(storage, queued.snapshotId, config, io);
  return EXIT_SUCCESS;
};

const audit = async (config: AuditConfig, io: CliIo, hooks: CliHooks): Promise<number> => {
  const progress = new ProgressReporter((text) => {
    io.stderr(text);
  }, io.stderrIsTty);
  let storage: Storage | null = null;
  try {
    const opened = await (hooks.storageFactory ?? createStorage)(config);
    storage = opened;
    hooks.onStorageOpened?.(opened);
    const crawl = config.mode === 'direct' ? crawlInProcess : crawlInQueue;
    return await crawl(config, opened, progress, io, hooks);
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

interface EmbeddedWorker {
  /** Aborts the loop and resolves once it is over; the running audit is back in the queue. */
  stop(): Promise<void>;
  /** Settles when the loop is over, whoever stopped it. */
  done: Promise<void>;
}

/** The worker loop runs beside the API until `stop()`, which hands the running audit back to the queue. */
const startEmbeddedWorker = (worker: {
  run(signal: AbortSignal): Promise<void>;
}): EmbeddedWorker => {
  const shutdown = new AbortController();
  const loop = worker.run(shutdown.signal);
  return {
    stop: async () => {
      shutdown.abort();
      await loop;
    },
    done: loop,
  };
};

const serve = async (config: ServeConfig, io: CliIo, hooks: CliHooks): Promise<number> => {
  let storage: Storage | null = null;
  let server: HttpServer | null = null;
  let worker: EmbeddedWorker | null = null;
  let stopPurge: (() => void) | null = null;
  try {
    if (config.mail.kind === 'console') io.stderr(`Avertissement, ${CONSOLE_MAILER_WARNING}\n`);
    const opened = await (hooks.storageFactory ?? createStorage)(config);
    storage = opened;
    hooks.onStorageOpened?.(opened);
    const clock = new SystemClock();
    await new RecoverStaleAudits(opened.queue, opened.snapshots, clock).execute();
    const logger = {
      info: (message: string) => {
        io.stderr(`${message}\n`);
      },
      error: (message: string) => {
        io.stderr(`${message}\n`);
      },
    };
    stopPurge = await startDailyPurge(
      new PurgeStaleAccounts({
        eraser: opened.eraser,
        sessions: opened.sessions,
        emailTokens: opened.emailTokens,
        clock,
      }),
      logger,
    );
    if (config.workerMode === 'embedded') {
      worker = startEmbeddedWorker(
        createAuditWorker({
          storage: opened,
          logger,
          allowPrivateTargets: config.allowPrivateTargets,
          delayMs: config.delayMs,
          concurrency: 1,
        }),
      );
      hooks.onWorkerStarted?.(worker);
    }
    server = (hooks.createServer ?? buildServer)({
      projects: storage.projects,
      snapshots: storage.snapshots,
      health: storage.health,
      queue: opened.queue,
      hostResolver: new DnsHostResolver(),
      allowPrivateTargets: config.allowPrivateTargets,
      users: opened.users,
      sessions: opened.sessions,
      emailTokens: opened.emailTokens,
      eraser: opened.eraser,
      rateLimiter: new InMemoryRateLimiter(clock),
      passwordHasher: new ScryptPasswordHasher(),
      mailer: createMailer(config.mail, logger, (text) => {
        io.stderr(text);
      }),
      tokenGenerator: new RandomTokenGenerator(),
      clock,
      publicUrl: config.mail.publicUrl ?? DEFAULT_PUBLIC_URL,
      adminEmails: config.adminEmails,
      launchesPerDay: config.launchesPerDay,
      queueMax: config.queueMax,
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
    stopPurge?.();
    await server?.close();
    await worker?.stop();
    await storage?.close();
  }
};

const consoleLogger = (io: CliIo): Logger => ({
  info: (message) => {
    io.stderr(`${message}\n`);
  },
  error: (message) => {
    io.stderr(`${message}\n`);
  },
});

/** Dedicated process: crawls the queued audits until a signal stops it. */
const work = async (config: WorkerConfig, io: CliIo, hooks: CliHooks): Promise<number> => {
  let storage: Storage | null = null;
  let worker: EmbeddedWorker | null = null;
  try {
    const opened = await (hooks.storageFactory ?? createStorage)(config);
    storage = opened;
    hooks.onStorageOpened?.(opened);
    worker = startEmbeddedWorker(
      createAuditWorker({
        storage: opened,
        logger: consoleLogger(io),
        allowPrivateTargets: config.allowPrivateTargets,
        delayMs: config.delayMs,
        concurrency: config.concurrency,
      }),
    );
    hooks.onWorkerProcessStarted?.(worker);
    await worker.done;
    return EXIT_SUCCESS;
  } catch (error) {
    io.stderr(`Démarrage du worker échoué : ${errorMessage(error)}\n`);
    return EXIT_CRAWL_FAILED;
  } finally {
    await worker?.stop();
    await storage?.close();
  }
};

const workerHealth = async (
  config: WorkerHealthConfig,
  io: CliIo,
  hooks: CliHooks,
): Promise<number> => {
  let storage: Storage | null = null;
  try {
    storage = await (hooks.storageFactory ?? createStorage)(config);
    const workerIds = workerIdsFor(hooks.hostname ?? os.hostname(), config.concurrency);
    const healthy = await new CheckWorkerHealth(
      storage.queue,
      hooks.clock ?? new SystemClock(),
    ).execute(workerIds);
    if (healthy) return EXIT_SUCCESS;
    io.stderr('Worker en panne : aucun worker actif sur cet hôte depuis moins de 60 s.\n');
    return EXIT_CRAWL_FAILED;
  } catch (error) {
    io.stderr(`Contrôle du worker échoué : ${errorMessage(error)}\n`);
    return EXIT_CRAWL_FAILED;
  } finally {
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
    const comparison = await new CompareSnapshots(storage.snapshots, storage.projects).execute(
      ANONYMOUS_READER,
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
  if (command.kind === 'worker') return work(command, io, hooks);
  if (command.kind === 'worker-health') return workerHealth(command, io, hooks);
  if (command.kind === 'serve') return serve(command, io, hooks);
  if (command.kind === 'compare') return compare(command, io, hooks);
  return audit(command.config, io, hooks);
};
