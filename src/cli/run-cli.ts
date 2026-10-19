import { BfsCrawler } from '../application/bfs-crawler.js';
import type { SnapshotRepository } from '../application/ports/snapshot-repository.js';
import { GetSnapshotReport } from '../application/get-snapshot-report.js';
import { RunAudit } from '../application/run-audit.js';
import { CheckRegistry } from '../domain/check.js';
import { allChecks } from '../domain/checks/index.js';
import { CheerioHtmlParser } from '../infrastructure/cheerio-html-parser.js';
import { FastXmlSitemapReader } from '../infrastructure/fast-xml-sitemap-reader.js';
import { RealSleeper } from '../infrastructure/real-sleeper.js';
import { RobotsParserAdapter } from '../infrastructure/robots-parser-adapter.js';
import { SqliteSnapshotRepository } from '../infrastructure/sqlite/sqlite-snapshot-repository.js';
import { SystemClock } from '../infrastructure/system-clock.js';
import { UndiciHttpClient } from '../infrastructure/undici-http-client.js';
import { buildUserAgent } from '../infrastructure/user-agent.js';
import { parseCommand, type AuditConfig } from './config.js';
import { writeJsonExport } from './json-export.js';
import { ProgressReporter } from './progress-reporter.js';
import { renderSummary } from './render-summary.js';
import { USAGE } from './usage.js';

export const EXIT_SUCCESS = 0;
export const EXIT_CRAWL_FAILED = 1;
export const EXIT_USAGE = 2;
export const EXIT_INTERRUPTED = 130;

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  stderrIsTty: boolean;
}

export interface CliHooks {
  /** Lets the process entry point mark the snapshot failed on SIGINT. */
  onAuditStarted?(repository: SnapshotRepository, snapshotId: string): void;
}

const labelsById = (): ReadonlyMap<number, string> =>
  new Map(allChecks.map((check) => [check.id, check.label]));

const buildRunAudit = (repository: SqliteSnapshotRepository): RunAudit => {
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
    repository,
    projects: repository.projects,
    registry: new CheckRegistry(allChecks),
    clock,
  });
};

const audit = async (config: AuditConfig, io: CliIo, hooks: CliHooks): Promise<number> => {
  const repository = SqliteSnapshotRepository.open(config.dbPath);
  const progress = new ProgressReporter((text) => {
    io.stderr(text);
  }, io.stderrIsTty);
  try {
    const details = await buildRunAudit(repository).execute({
      rootUrl: config.rootUrl,
      limit: config.limit,
      delayMs: config.delayMs,
      onProgress: (crawled, limit) => {
        progress.update(crawled, limit);
      },
      onSnapshotCreated: (id) => {
        hooks.onAuditStarted?.(repository, id);
      },
    });
    progress.finish();
    const report = await new GetSnapshotReport(repository).execute(details.snapshot.id);
    io.stdout(renderSummary(report, labelsById()));
    if (config.jsonPath !== null) writeJsonExport(config.jsonPath, report);
    return EXIT_SUCCESS;
  } catch (error) {
    progress.finish();
    io.stderr(`Audit échoué : ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT_CRAWL_FAILED;
  } finally {
    repository.close();
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
  return audit(command.config, io, hooks);
};
