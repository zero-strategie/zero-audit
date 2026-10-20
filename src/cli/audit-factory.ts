import { BfsCrawler } from '../application/bfs-crawler.js';
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
import type { Storage } from './storage-factory.js';

export interface RunAuditOptions {
  storage: Pick<Storage, 'projects' | 'snapshots'>;
  events: AuditEvents;
  /** Refuse non-public targets (SSRF guard); on for audits launched from the server. */
  blockPrivateAddresses: boolean;
}

/** Single composition of a real audit, shared by the CLI and the HTTP server. */
export const createRunAudit = ({
  storage,
  events,
  blockPrivateAddresses,
}: RunAuditOptions): RunAudit => {
  const clock = new SystemClock();
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
