import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Admission, AdmissionView, AuditQueue } from '../../application/ports/audit-queue.js';
import type {
  SnapshotDetails,
  SnapshotRepository,
} from '../../application/ports/snapshot-repository.js';
import type { CheckResult, IssueOccurrence, Severity } from '../../domain/check.js';
import type {
  HostProbe,
  Link,
  LinkType,
  Page,
  SiteFile,
  SiteFileFacts,
  HtmlFacts,
  SiteFileKind,
  SlashVariantProbe,
} from '../../domain/crawl.js';
import { AuditAttemptLost, SnapshotNotFound } from '../../domain/errors.js';
import { toTheme } from '../../domain/legacy-theme.js';
import { Snapshot, type SnapshotStatus } from '../../domain/snapshot.js';
import { hashToken } from '../hash-token.js';
import { withTransaction } from './pool.js';
import { PostgresProjectRepository } from './postgres-project-repository.js';

type Queryable = pg.Pool | pg.PoolClient;

/** Arbitrary constant (distinct from the migration lock): serializes the admission of new audits. */
const ENQUEUE_LOCK_KEY = 7_204_002;

type SnapshotRow = {
  id: string;
  project_id: string;
  status: SnapshotStatus;
  started_at: Date;
  finished_at: Date | null;
  pages_crawled: number;
  pages_limit: number;
  attempts: number;
  queued_at: Date | null;
  heartbeat_at: Date | null;
};

type PageRow = {
  url: string;
  depth: number;
  status: number | null;
  error: string | null;
  redirect_target: string | null;
  redirect_chain: string[];
  headers: Record<string, string>;
  response_time_ms: number;
  content_type: string | null;
  is_html: boolean;
  title: string | null;
  meta_description: string | null;
  canonical: string | null;
  h1: string[];
  word_count: number | null;
  text_ratio: number | null;
  content_hash: string | null;
  blocked_by_robots: boolean;
  html_facts: HtmlFacts | null;
  in_sitemap: boolean | null;
};

type LinkRow = {
  source_url: string;
  target_url: string;
  type: LinkType;
  rel: string | null;
  anchor: string | null;
};

type SiteFileRow = {
  facts: SiteFileFacts | null;
  kind: SiteFileKind;
  url: string;
  status: number | null;
  error: string | null;
};

type HostProbeRow = {
  url: string;
  status: number | null;
  error: string | null;
  is_html: boolean;
  canonical: string | null;
};

type SlashProbeRow = HostProbeRow & { source_page_url: string };

type CheckResultRow = {
  check_id: number;
  severity: Severity;
  theme: string;
  count: number;
  examined: number;
};

type OccurrenceRow = {
  check_id: number;
  page_url: string | null;
  info: Record<string, unknown>;
};

/** Tables holding what a crawl attempt wrote, emptied when the attempt is given up. */
const ATTEMPT_TABLES = [
  'issue_occurrences',
  'check_results',
  'slash_probes',
  'host_probes',
  'site_files',
  'links',
  'pages',
] as const;

const toSnapshot = (row: SnapshotRow): Snapshot =>
  Snapshot.restore({
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    pagesCrawled: row.pages_crawled,
    pagesLimit: row.pages_limit,
    attempts: row.attempts,
    queuedAt: row.queued_at,
    heartbeatAt: row.heartbeat_at,
  });

const stringifyFacts = (facts: HtmlFacts | SiteFileFacts | null): string | null =>
  facts === null ? null : JSON.stringify(facts);

const toPage = (row: PageRow): Page => ({
  url: row.url,
  depth: row.depth,
  status: row.status,
  error: row.error,
  redirectTarget: row.redirect_target,
  redirectChain: row.redirect_chain,
  headers: row.headers,
  responseTimeMs: row.response_time_ms,
  contentType: row.content_type,
  isHtml: row.is_html,
  title: row.title,
  metaDescription: row.meta_description,
  canonical: row.canonical,
  h1: row.h1,
  wordCount: row.word_count,
  textRatio: row.text_ratio,
  contentHash: row.content_hash,
  blockedByRobots: row.blocked_by_robots,
  htmlFacts: row.html_facts,
  inSitemap: row.in_sitemap,
});

const toLink = (row: LinkRow): Link => ({
  sourceUrl: row.source_url,
  targetUrl: row.target_url,
  type: row.type,
  rel: row.rel,
  anchor: row.anchor,
});

const toSiteFile = (row: SiteFileRow): SiteFile => ({
  kind: row.kind,
  url: row.url,
  status: row.status,
  error: row.error,
  facts: row.facts,
});

const toHostProbe = (row: HostProbeRow): HostProbe => ({
  url: row.url,
  status: row.status,
  error: row.error,
  isHtml: row.is_html,
  canonical: row.canonical,
});

const toSlashProbe = (row: SlashProbeRow): SlashVariantProbe => ({
  ...toHostProbe(row),
  sourcePageUrl: row.source_page_url,
});

/**
 * The launch journal (`api_launches`) records every launch attributed to an account, keyed by a
 * hash of the e-mail address, so the admission counters survive an account erasure. See the
 * "Legacy tables" section of docs/developer-guide.md.
 */
export class PostgresSnapshotRepository implements SnapshotRepository, AuditQueue {
  readonly projects: PostgresProjectRepository;

  constructor(private readonly pool: pg.Pool) {
    this.projects = new PostgresProjectRepository(pool);
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async create(input: {
    projectId: string;
    launchedBy: string | null;
    pagesLimit: number;
    startedAt: Date;
  }): Promise<Snapshot> {
    const { launchedBy, ...props } = input;
    const snapshot = Snapshot.start({ id: randomUUID(), ...props });
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO snapshots (id, project_id, launched_by, status, started_at, pages_crawled, pages_limit)
         VALUES ($1, $2, $3, $4, $5, 0, $6)`,
        [
          snapshot.id,
          snapshot.projectId,
          launchedBy,
          snapshot.status,
          snapshot.startedAt,
          snapshot.pagesLimit,
        ],
      );
      if (launchedBy !== null) await this.journalLaunch(client, launchedBy, snapshot);
    });
    return snapshot;
  }

  /** The advisory lock makes the admission and the insert atomic across every process. */
  enqueue(
    input: { projectId: string; launchedBy: string | null; pagesLimit: number; requestedAt: Date },
    admit: Admission,
  ): Promise<Snapshot> {
    return withTransaction(this.pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [ENQUEUE_LOCK_KEY]);
      await admit(this.admissionView(client));
      const { requestedAt, launchedBy, ...props } = input;
      const snapshot = Snapshot.enqueue({ id: randomUUID(), startedAt: requestedAt, ...props });
      await client.query(
        `INSERT INTO snapshots (id, project_id, launched_by, status, started_at, pages_crawled, pages_limit, attempts, queued_at)
         VALUES ($1, $2, $3, $4, $5, 0, $6, 0, $5)`,
        [
          snapshot.id,
          snapshot.projectId,
          launchedBy,
          snapshot.status,
          snapshot.startedAt,
          snapshot.pagesLimit,
        ],
      );
      if (launchedBy !== null) await this.journalLaunch(client, launchedBy, snapshot);
      return snapshot;
    });
  }

  private admissionView(db: Queryable): AdmissionView {
    return {
      listLaunchedAtBy: (userId, since) => this.launchedAtBy(db, userId, since),
      countApiLaunchedSince: (since) => this.apiLaunchedSince(db, since),
      countActiveFor: (userId) => this.activeFor(db, userId),
      countQueued: () => this.queuedCount(db),
    };
  }

  /** Asking for work proves the worker is alive, so its presence is recorded even on an empty queue. */
  async claimNext(workerId: string, now: Date): Promise<Snapshot | null> {
    await this.recordWorkerPresence(workerId, now);
    const { rows } = await this.pool.query<SnapshotRow>(
      `UPDATE snapshots
       SET status = 'running', attempts = attempts + 1, heartbeat_at = $1
       WHERE id = (
         SELECT id FROM snapshots WHERE status = 'queued'
         ORDER BY queued_at, id FOR UPDATE SKIP LOCKED LIMIT 1
       ) AND status = 'queued'
       RETURNING *`,
      [now],
    );
    return rows[0] ? toSnapshot(rows[0]) : null;
  }

  async finishAttempt(
    id: string,
    attempt: number,
    input: { finishedAt: Date; pagesCrawled: number },
  ): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE snapshots SET status = 'finished', finished_at = $1, pages_crawled = $2
       WHERE id = $3 AND status = 'running' AND attempts = $4`,
      [input.finishedAt, input.pagesCrawled, id, attempt],
    );
    if (rowCount === 0) throw new AuditAttemptLost(id, attempt);
  }

  async heartbeat(id: string, attempt: number, pagesCrawled: number, now: Date): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE snapshots SET pages_crawled = $1, heartbeat_at = $2
       WHERE id = $3 AND status = 'running' AND attempts = $4`,
      [pagesCrawled, now, id, attempt],
    );
    if (rowCount === 0) throw new AuditAttemptLost(id, attempt);
  }

  async failAttempt(id: string, attempt: number, finishedAt: Date): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE snapshots SET status = 'failed', finished_at = $1
       WHERE id = $2 AND status = 'running' AND attempts = $3`,
      [finishedAt, id, attempt],
    );
    if (rowCount === 0) throw new AuditAttemptLost(id, attempt);
  }

  requeue(id: string, attempt: number, now: Date): Promise<Snapshot> {
    return withTransaction(this.pool, async (client) => {
      const { rows } = await client.query<SnapshotRow>(
        "SELECT * FROM snapshots WHERE id = $1 AND status = 'running' AND attempts = $2 FOR UPDATE",
        [id, attempt],
      );
      if (!rows[0]) throw new AuditAttemptLost(id, attempt);
      return this.interrupt(client, toSnapshot(rows[0]), now);
    });
  }

  /** SKIP LOCKED: an audit another recovery is already handling is left to it. */
  recoverStale(now: Date, staleAfterMs: number): Promise<readonly Snapshot[]> {
    return withTransaction(this.pool, async (client) => {
      const { rows } = await client.query<SnapshotRow>(
        `SELECT * FROM snapshots WHERE status = 'running' AND heartbeat_at < $1
         ORDER BY queued_at, id FOR UPDATE SKIP LOCKED`,
        [new Date(now.getTime() - staleAfterMs)],
      );
      const recovered: Snapshot[] = [];
      for (const row of rows) recovered.push(await this.interrupt(client, toSnapshot(row), now));
      return recovered;
    });
  }

  async recordWorkerPresence(workerId: string, now: Date): Promise<void> {
    await this.pool.query(
      `INSERT INTO workers (id, heartbeat_at) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET heartbeat_at = EXCLUDED.heartbeat_at`,
      [workerId, now],
    );
  }

  async getWorkerPresence(workerId: string): Promise<Date | null> {
    const { rows } = await this.pool.query<{ heartbeat_at: Date }>(
      'SELECT heartbeat_at FROM workers WHERE id = $1',
      [workerId],
    );
    return rows[0]?.heartbeat_at ?? null;
  }

  /** The caller holds the row lock: the rows of the attempt are deleted along with its state change. */
  private async interrupt(client: pg.PoolClient, snapshot: Snapshot, now: Date): Promise<Snapshot> {
    const interrupted = snapshot.interrupt(now);
    for (const table of ATTEMPT_TABLES) {
      await client.query(`DELETE FROM ${table} WHERE snapshot_id = $1`, [snapshot.id]);
    }
    await client.query(
      `UPDATE snapshots SET status = $1, pages_crawled = 0, heartbeat_at = NULL, finished_at = $2
       WHERE id = $3`,
      [interrupted.status, interrupted.finishedAt, snapshot.id],
    );
    return interrupted;
  }

  async queuePosition(id: string): Promise<number | null> {
    const { rows } = await this.pool.query<{ position: string | null }>(
      `SELECT COUNT(*) AS position FROM snapshots AS other, snapshots AS me
       WHERE me.id = $1 AND me.status = 'queued' AND other.status = 'queued'
         AND (other.queued_at, other.id) <= (me.queued_at, me.id)`,
      [id],
    );
    const position = Number(rows[0]?.position);
    return position === 0 ? null : position;
  }

  countQueued(): Promise<number> {
    return this.queuedCount(this.pool);
  }

  countActiveFor(userId: string): Promise<number> {
    return this.activeFor(this.pool, userId);
  }

  private async queuedCount(db: Queryable): Promise<number> {
    const { rows } = await db.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM snapshots WHERE status = 'queued'",
    );
    return Number(rows[0]?.n);
  }

  private async activeFor(db: Queryable, userId: string): Promise<number> {
    const { rows } = await db.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM snapshots WHERE launched_by = $1 AND status IN ('queued', 'running')",
      [userId],
    );
    return Number(rows[0]?.n);
  }

  private async journalLaunch(db: Queryable, userId: string, snapshot: Snapshot): Promise<void> {
    const emailHash = await this.emailHashOf(db, userId);
    if (emailHash === null) return;
    await db.query('INSERT INTO api_launches (id, email_hash, launched_at) VALUES ($1, $2, $3)', [
      snapshot.id,
      emailHash,
      snapshot.startedAt,
    ]);
  }

  private async emailHashOf(db: pg.Pool | pg.PoolClient, userId: string): Promise<string | null> {
    const { rows } = await db.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [
      userId,
    ]);
    const email = rows[0]?.email;
    return email === undefined ? null : hashToken(email);
  }

  listLaunchedAtBy(userId: string, since: Date): Promise<readonly Date[]> {
    return this.launchedAtBy(this.pool, userId, since);
  }

  countApiLaunchedSince(since: Date): Promise<number> {
    return this.apiLaunchedSince(this.pool, since);
  }

  private async launchedAtBy(db: Queryable, userId: string, since: Date): Promise<readonly Date[]> {
    const emailHash = await this.emailHashOf(db, userId);
    if (emailHash === null) return [];
    const { rows } = await db.query<{ launched_at: Date }>(
      'SELECT launched_at FROM api_launches WHERE email_hash = $1 AND launched_at >= $2 ORDER BY launched_at',
      [emailHash, since],
    );
    return rows.map((row) => row.launched_at);
  }

  private async apiLaunchedSince(db: Queryable, since: Date): Promise<number> {
    const { rows } = await db.query<{ n: string }>(
      'SELECT COUNT(*) AS n FROM api_launches WHERE launched_at >= $1',
      [since],
    );
    return Number(rows[0]?.n);
  }

  addPages(id: string, pages: readonly Page[]): Promise<void> {
    return this.writeToRunning(id, async (db) => {
      for (const page of pages) {
        await db.query(
          `INSERT INTO pages (snapshot_id, url, depth, status, error, redirect_target, redirect_chain,
             headers, response_time_ms, content_type, is_html, title, meta_description, canonical, h1,
             word_count, text_ratio, content_hash, blocked_by_robots, html_facts, in_sitemap)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
          [
            id,
            page.url,
            page.depth,
            page.status,
            page.error,
            page.redirectTarget,
            JSON.stringify(page.redirectChain),
            JSON.stringify(page.headers),
            page.responseTimeMs,
            page.contentType,
            page.isHtml,
            page.title,
            page.metaDescription,
            page.canonical,
            JSON.stringify(page.h1),
            page.wordCount,
            page.textRatio,
            page.contentHash,
            page.blockedByRobots,
            stringifyFacts(page.htmlFacts),
            page.inSitemap,
          ],
        );
      }
    });
  }

  addLinks(id: string, links: readonly Link[]): Promise<void> {
    return this.writeToRunning(id, async (db) => {
      for (const link of links) {
        await db.query(
          'INSERT INTO links (snapshot_id, source_url, target_url, type, rel, anchor) VALUES ($1, $2, $3, $4, $5, $6)',
          [id, link.sourceUrl, link.targetUrl, link.type, link.rel, link.anchor],
        );
      }
    });
  }

  addSiteFiles(id: string, files: readonly SiteFile[]): Promise<void> {
    return this.writeToRunning(id, async (db) => {
      for (const file of files) {
        await db.query(
          'INSERT INTO site_files (snapshot_id, kind, url, status, error, facts) VALUES ($1, $2, $3, $4, $5, $6)',
          [id, file.kind, file.url, file.status, file.error, stringifyFacts(file.facts)],
        );
      }
    });
  }

  addHostProbe(id: string, probe: HostProbe): Promise<void> {
    return this.writeToRunning(id, async (db) => {
      await db.query(
        'INSERT INTO host_probes (snapshot_id, url, status, error, is_html, canonical) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, probe.url, probe.status, probe.error, probe.isHtml, probe.canonical],
      );
    });
  }

  addSlashProbes(id: string, probes: readonly SlashVariantProbe[]): Promise<void> {
    return this.writeToRunning(id, async (db) => {
      for (const probe of probes) {
        await db.query(
          'INSERT INTO slash_probes (snapshot_id, url, source_page_url, status, error, is_html, canonical) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [
            id,
            probe.url,
            probe.sourcePageUrl,
            probe.status,
            probe.error,
            probe.isHtml,
            probe.canonical,
          ],
        );
      }
    });
  }

  addCheckResults(id: string, results: readonly CheckResult[]): Promise<void> {
    return this.writeToRunning(id, async (db) => {
      for (const result of results) {
        await db.query(
          'INSERT INTO check_results (snapshot_id, check_id, severity, theme, count, examined) VALUES ($1, $2, $3, $4, $5, $6)',
          [id, result.checkId, result.severity, result.theme, result.count, result.examined],
        );
        for (const occurrence of result.occurrences) {
          await db.query(
            'INSERT INTO issue_occurrences (snapshot_id, check_id, page_url, info) VALUES ($1, $2, $3, $4)',
            [id, occurrence.checkId, occurrence.pageUrl, JSON.stringify(occurrence.info)],
          );
        }
      }
    });
  }

  finish(id: string, input: { finishedAt: Date; pagesCrawled: number }): Promise<void> {
    return this.writeToRunning(id, async (db, snapshot) => {
      const finished = snapshot.finish(input.finishedAt, input.pagesCrawled);
      await db.query(
        'UPDATE snapshots SET status = $1, finished_at = $2, pages_crawled = $3 WHERE id = $4',
        [finished.status, input.finishedAt, input.pagesCrawled, id],
      );
    });
  }

  fail(id: string, finishedAt: Date): Promise<void> {
    return this.writeToRunning(id, async (db, snapshot) => {
      const failed = snapshot.fail(finishedAt);
      await db.query('UPDATE snapshots SET status = $1, finished_at = $2 WHERE id = $3', [
        failed.status,
        finishedAt,
        id,
      ]);
    });
  }

  async getById(id: string): Promise<SnapshotDetails | null> {
    const { rows } = await this.pool.query<SnapshotRow>('SELECT * FROM snapshots WHERE id = $1', [
      id,
    ]);
    const row = rows[0];
    if (!row) return null;
    const [pages, links, siteFiles, hostProbes, slashProbes, checkResults] = await Promise.all([
      this.pool.query<PageRow>('SELECT * FROM pages WHERE snapshot_id = $1 ORDER BY id', [id]),
      this.pool.query<LinkRow>('SELECT * FROM links WHERE snapshot_id = $1 ORDER BY id', [id]),
      this.pool.query<SiteFileRow>(
        'SELECT * FROM site_files WHERE snapshot_id = $1 ORDER BY kind, url, id',
        [id],
      ),
      this.pool.query<HostProbeRow>('SELECT * FROM host_probes WHERE snapshot_id = $1', [id]),
      this.pool.query<SlashProbeRow>(
        'SELECT * FROM slash_probes WHERE snapshot_id = $1 ORDER BY source_page_url, url, id',
        [id],
      ),
      this.readCheckResults(this.pool, id),
    ]);
    return {
      snapshot: toSnapshot(row),
      pages: pages.rows.map(toPage),
      links: links.rows.map(toLink),
      checkResults,
      siteFiles: siteFiles.rows.map(toSiteFile),
      slashProbes: slashProbes.rows.map(toSlashProbe),
      hostProbe: hostProbes.rows[0] ? toHostProbe(hostProbes.rows[0]) : null,
    };
  }

  async listByProject(projectId: string): Promise<readonly Snapshot[]> {
    const { rows } = await this.pool.query<SnapshotRow>(
      'SELECT * FROM snapshots WHERE project_id = $1 ORDER BY started_at DESC, id',
      [projectId],
    );
    return rows.map(toSnapshot);
  }

  async listRunning(): Promise<readonly Snapshot[]> {
    const { rows } = await this.pool.query<SnapshotRow>(
      "SELECT * FROM snapshots WHERE status = 'running' ORDER BY started_at DESC, id",
    );
    return rows.map(toSnapshot);
  }

  async findPreviousFinished(projectId: string, beforeStartedAt: Date): Promise<Snapshot | null> {
    const { rows } = await this.pool.query<SnapshotRow>(
      `SELECT * FROM snapshots
       WHERE project_id = $1 AND status = 'finished' AND started_at < $2
       ORDER BY started_at DESC, id LIMIT 1`,
      [projectId, beforeStartedAt],
    );
    return rows[0] ? toSnapshot(rows[0]) : null;
  }

  private async readCheckResults(db: Queryable, id: string): Promise<CheckResult[]> {
    const [results, occurrences] = await Promise.all([
      db.query<CheckResultRow>('SELECT * FROM check_results WHERE snapshot_id = $1 ORDER BY id', [
        id,
      ]),
      db.query<OccurrenceRow>(
        'SELECT check_id, page_url, info FROM issue_occurrences WHERE snapshot_id = $1 ORDER BY id',
        [id],
      ),
    ]);
    return results.rows.map((row) => ({
      checkId: row.check_id,
      severity: row.severity,
      theme: toTheme(row.theme),
      count: row.count,
      examined: row.examined,
      occurrences: occurrences.rows
        .filter((occurrence) => occurrence.check_id === row.check_id)
        .map((occurrence): IssueOccurrence => ({
          checkId: occurrence.check_id,
          pageUrl: occurrence.page_url,
          info: occurrence.info,
        })),
    }));
  }

  /** The row lock makes the status check and the write atomic: a finished snapshot is never touched. */
  private writeToRunning(
    id: string,
    write: (db: pg.PoolClient, snapshot: Snapshot) => Promise<void>,
  ): Promise<void> {
    return withTransaction(this.pool, async (client) => {
      const { rows } = await client.query<SnapshotRow>(
        'SELECT * FROM snapshots WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!rows[0]) throw new SnapshotNotFound(id);
      const snapshot = toSnapshot(rows[0]);
      snapshot.assertWritable();
      await write(client, snapshot);
    });
  }
}
