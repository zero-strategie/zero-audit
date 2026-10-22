import { BfsCrawler } from '../application/bfs-crawler.js';
import os from 'node:os';
import { ProcessAuditQueue } from '../application/process-audit-queue.js';
import { RecoverStaleAudits } from '../application/recover-stale-audits.js';
import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import type { AuditEvents } from '../application/ports/audit-events.js';
import { RunAudit } from '../application/run-audit.js';
import { CheckRegistry } from '../domain/check.js';
import { allChecks } from '../domain/checks/index.js';
import { CheerioHtmlParser } from '../infrastructure/cheerio-html-parser.js';
import { FastXmlSitemapReader } from '../infrastructure/fast-xml-sitemap-reader.js';
import { RealSleeper } from '../infrastructure/real-sleeper.js';
import { RobotsParserAdapter } from '../infrastructure/robots-parser-adapter.js';
import { SystemClock } from '../infrastructure/system-clock.js';
import { UndiciHttpClient } from '../infrastructure/undici-http-client.js';
import { buildUserAgent } from '../infrastructure/user-agent.js';
import type { Storage } from './storage.js';

export interface RunAuditOptions {
  storage: Pick<Storage, 'projects' | 'snapshots'>;
  events: AuditEvents;
  /** Refuse non-public targets (SSRF guard); on unless explicitly lifted. */
  blockPrivateAddresses?: boolean;
  /** Time source of the crawl and of the snapshot; defaults to the system clock. */
  clock?: Clock;
}

/** Single composition of a real audit, used by the CLI and by library consumers. */
export const createRunAudit = ({
  storage,
  events,
  blockPrivateAddresses = true,
  clock = new SystemClock(),
}: RunAuditOptions): RunAudit => {
  const http = new UndiciHttpClient({
    clock,
    userAgent: buildUserAgent(),
    blockPrivateAddresses,
  });
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
    events,
  });
};

export interface AuditWorkerOptions {
  storage: Pick<Storage, 'projects' | 'snapshots' | 'queue'>;
  logger: Logger;
  /** The SSRF guard of the worker is on unless it is explicitly lifted. */
  allowPrivateTargets?: boolean;
  delayMs: number;
  /** Audits crawled in parallel. */
  concurrency: number;
}

const ignoredEvents: AuditEvents = {
  started: () => undefined,
  finished: () => undefined,
  failed: () => undefined,
};

/** Single composition of the worker loop, used by the worker command. */
export const createAuditWorker = ({
  storage,
  logger,
  allowPrivateTargets = false,
  delayMs,
  concurrency,
}: AuditWorkerOptions): ProcessAuditQueue => {
  const clock = new SystemClock();
  return new ProcessAuditQueue({
    queue: storage.queue,
    runAudit: createRunAudit({
      storage,
      events: ignoredEvents,
      blockPrivateAddresses: !allowPrivateTargets,
    }),
    recover: new RecoverStaleAudits(storage.queue, storage.snapshots, clock),
    clock,
    sleeper: new RealSleeper(),
    logger,
    hostname: os.hostname(),
    concurrency,
    delayMs,
  });
};
