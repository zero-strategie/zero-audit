import { BfsCrawler } from '../application/bfs-crawler.js';
import { CompareSnapshots } from '../application/compare-snapshots.js';
import { GetSnapshotReport } from '../application/get-snapshot-report.js';
import { RunAudit } from '../application/run-audit.js';
import { CheckRegistry } from '../domain/check.js';
import {
  SnapshotNotFinished,
  SnapshotNotFound,
  SnapshotsFromDifferentProjects,
} from '../domain/errors.js';
import { allChecks } from '../domain/checks/index.js';
import { CheerioHtmlParser } from '../infrastructure/cheerio-html-parser.js';
import { FastXmlSitemapReader } from '../infrastructure/fast-xml-sitemap-reader.js';
import { RealSleeper } from '../infrastructure/real-sleeper.js';
import { RobotsParserAdapter } from '../infrastructure/robots-parser-adapter.js';
import { SystemClock } from '../infrastructure/system-clock.js';
import { UndiciHttpClient } from '../infrastructure/undici-http-client.js';
import { buildUserAgent } from '../infrastructure/user-agent.js';
import { buildServer, type HttpServer, type ServerDependencies } from '../http/server.js';
import { parseCommand, type AuditConfig, type CompareConfig, type ServeConfig } from './config.js';
import { writeJsonExport } from './json-export.js';
import { ProgressReporter } from './progress-reporter.js';
import { renderComparison } from './render-compare.js';
import { renderSummary } from './render-summary.js';
import { createStorage, type Storage, type StorageFactory } from './storage-factory.js';
import { USAGE } from './usage.js';

export const EXIT_SUCCESS = 0;
export const EXIT_CRAWL_FAILED = 1;
export const EXIT_USAGE = 2;

/** Local only until the API gets authentication. */
export const SERVE_HOST = '127.0.0.1';

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  stderrIsTty: boolean;
}

export interface CliHooks {
  /** Lets the process entry point release the storage on SIGINT. */
  onStorageOpened?(storage: Storage): void;
  /** Lets the process entry point mark the snapshot failed on SIGINT. */
  onAuditStarted?(snapshotId: string): void;
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

const buildRunAudit = (storage: Storage): RunAudit => {
  const clock = new SystemClock();
  const http = new UndiciHttpClient({ clock, userAgent: buildUserAgent() });
  const crawler = new BfsCrawler({
    http,
    robotsFactory: new RobotsParserAdapter(),
    sitemapReader: new FastXmlSitemapReader(),
    htmlParser: new CheerioHtmlParser(),
    clock,
    sleeper: new RealSleeper(),
  });
  return new RunAudit({
    crawler,
    repository: storage.snapshots,
    projects: storage.projects,
    registry: new CheckRegistry(allChecks),
    clock,
  });
};

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
    const details = await buildRunAudit(opened).execute({
      rootUrl: config.rootUrl,
      limit: config.limit,
      delayMs: config.delayMs,
      onProgress: (crawled, limit) => {
        progress.update(crawled, limit);
      },
      onSnapshotCreated: (id) => {
        hooks.onAuditStarted?.(id);
      },
    });
    progress.finish();
    const report = await new GetSnapshotReport(opened.snapshots).execute(details.snapshot.id);
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

const serve = async (config: ServeConfig, io: CliIo, hooks: CliHooks): Promise<number> => {
  let storage: Storage | null = null;
  let server: HttpServer | null = null;
  try {
    storage = await (hooks.storageFactory ?? createStorage)(config);
    hooks.onStorageOpened?.(storage);
    server = (hooks.createServer ?? buildServer)({
      projects: storage.projects,
      snapshots: storage.snapshots,
    });
    hooks.onServerStarted?.(server);
    await server.listen({ host: SERVE_HOST, port: config.port });
    io.stdout(`API à l'écoute sur http://${SERVE_HOST}:${String(config.port)}\n`);
    await (hooks.untilStopped ?? new Promise<never>(() => undefined));
    return EXIT_SUCCESS;
  } catch (error) {
    io.stderr(`Démarrage du serveur échoué : ${errorMessage(error)}\n`);
    return EXIT_CRAWL_FAILED;
  } finally {
    await server?.close();
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
  if (command.kind === 'serve') return serve(command, io, hooks);
  if (command.kind === 'compare') return compare(command, io, hooks);
  return audit(command.config, io, hooks);
};
