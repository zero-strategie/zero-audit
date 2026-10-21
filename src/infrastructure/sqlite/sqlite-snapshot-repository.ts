import type { Database as SqliteDatabase } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Admission, AuditQueue } from '../../application/ports/audit-queue.js';
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
  SiteFileKind,
  SlashVariantProbe,
} from '../../domain/crawl.js';
import { AuditAttemptLost, SnapshotNotFound } from '../../domain/errors.js';
import { toTheme } from '../../domain/legacy-theme.js';
import { Snapshot, type SnapshotStatus } from '../../domain/snapshot.js';
import { hashToken } from '../hash-token.js';
import { SqliteProjectRepository } from './sqlite-project-repository.js';
import { SqliteAccountEraser } from './sqlite-account-eraser.js';
import { SqliteEmailTokenRepository } from './sqlite-email-token-repository.js';
import { SqliteSessionRepository } from './sqlite-session-repository.js';
import { SqliteUserRepository } from './sqlite-user-repository.js';
import { migrate } from './migrate.js';
import { openDatabase } from './open-database.js';

interface SnapshotRow {
  id: string;
  project_id: string;
  status: SnapshotStatus;
  started_at: string;
  finished_at: string | null;
  pages_crawled: number;
  pages_limit: number;
  attempts: number;
  queued_at: string | null;
  heartbeat_at: string | null;
}

interface PageRow {
  url: string;
  depth: number;
  status: number | null;
  error: string | null;
  redirect_target: string | null;
  redirect_chain: string;
  headers: string;
  response_time_ms: number;
  content_type: string | null;
  is_html: number;
  title: string | null;
  meta_description: string | null;
  canonical: string | null;
  h1: string;
  word_count: number | null;
  text_ratio: number | null;
  content_hash: string | null;
  blocked_by_robots: number;
}

interface LinkRow {
  source_url: string;
  target_url: string;
  type: LinkType;
  rel: string | null;
  anchor: string | null;
}

interface SiteFileRow {
  kind: SiteFileKind;
  url: string;
  status: number | null;
  error: string | null;
}

interface HostProbeRow {
  url: string;
  status: number | null;
  error: string | null;
  is_html: number;
  canonical: string | null;
}

interface SlashProbeRow extends HostProbeRow {
  source_page_url: string;
}

interface CheckResultRow {
  check_id: number;
  severity: Severity;
  theme: string;
  count: number;
  examined: number;
}

interface OccurrenceRow {
  check_id: number;
  page_url: string | null;
  info: string;
}

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
    startedAt: new Date(row.started_at),
    finishedAt: row.finished_at === null ? null : new Date(row.finished_at),
    pagesCrawled: row.pages_crawled,
    pagesLimit: row.pages_limit,
    attempts: row.attempts,
    queuedAt: row.queued_at === null ? null : new Date(row.queued_at),
    heartbeatAt: row.heartbeat_at === null ? null : new Date(row.heartbeat_at),
  });

const toPage = (row: PageRow): Page => ({
  url: row.url,
  depth: row.depth,
  status: row.status,
  error: row.error,
  redirectTarget: row.redirect_target,
  redirectChain: JSON.parse(row.redirect_chain) as string[],
  headers: JSON.parse(row.headers) as Record<string, string>,
  responseTimeMs: row.response_time_ms,
  contentType: row.content_type,
  isHtml: row.is_html === 1,
  title: row.title,
  metaDescription: row.meta_description,
  canonical: row.canonical,
  h1: JSON.parse(row.h1) as string[],
  wordCount: row.word_count,
  textRatio: row.text_ratio,
  contentHash: row.content_hash,
  blockedByRobots: row.blocked_by_robots === 1,
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
});

const toHostProbe = (row: HostProbeRow): HostProbe => ({
  url: row.url,
  status: row.status,
  error: row.error,
  isHtml: row.is_html === 1,
  canonical: row.canonical,
});

const toSlashProbe = (row: SlashProbeRow): SlashVariantProbe => ({
  ...toHostProbe(row),
  sourcePageUrl: row.source_page_url,
});

export class SqliteSnapshotRepository implements SnapshotRepository, AuditQueue {
  readonly projects: SqliteProjectRepository;
  readonly users: SqliteUserRepository;
  readonly sessions: SqliteSessionRepository;
  readonly emailTokens: SqliteEmailTokenRepository;
  readonly eraser: SqliteAccountEraser;
  private enqueuing: Promise<unknown> = Promise.resolve();

  private constructor(private readonly db: SqliteDatabase) {
    this.projects = new SqliteProjectRepository(db);
    this.users = new SqliteUserRepository(db);
    this.sessions = new SqliteSessionRepository(db);
    this.emailTokens = new SqliteEmailTokenRepository(db);
    this.eraser = new SqliteAccountEraser(db);
  }

  static open(path: string): SqliteSnapshotRepository {
    const db = openDatabase(path);
    migrate(db);
    return new SqliteSnapshotRepository(db);
  }

  close(): void {
    this.db.close();
  }

  ping(): Promise<void> {
    return this.run(() => {
      this.db.prepare('SELECT 1').get();
    });
  }

  create(input: {
    projectId: string;
    launchedBy: string | null;
    pagesLimit: number;
    startedAt: Date;
  }): Promise<Snapshot> {
    return this.run(() => {
      const { launchedBy, ...props } = input;
      const snapshot = Snapshot.start({ id: randomUUID(), ...props });
      this.db.transaction(() => {
        this.db
          .prepare(
            'INSERT INTO snapshots (id, project_id, launched_by, status, started_at, pages_crawled, pages_limit) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            snapshot.id,
            snapshot.projectId,
            launchedBy,
            snapshot.status,
            snapshot.startedAt.toISOString(),
            0,
            snapshot.pagesLimit,
          );
        if (launchedBy !== null) this.journalLaunch(launchedBy, snapshot);
      })();
      return snapshot;
    });
  }

  /**
   * The write lock is taken up front (`BEGIN IMMEDIATE`) and held while the admission reads, so two
   * processes cannot both be admitted. In this process, requests wait for one another: the
   * admission awaits, and a second transaction on the same connection would fail.
   */
  enqueue(
    input: { projectId: string; launchedBy: string | null; pagesLimit: number; requestedAt: Date },
    admit: Admission,
  ): Promise<Snapshot> {
    const admitted = this.enqueuing.then(async () => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        await admit(this);
        const { requestedAt, launchedBy, ...props } = input;
        const snapshot = Snapshot.enqueue({ id: randomUUID(), startedAt: requestedAt, ...props });
        this.insertQueued(snapshot, launchedBy);
        this.db.exec('COMMIT');
        return snapshot;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    });
    this.enqueuing = admitted.catch(() => undefined);
    return admitted;
  }

  private insertQueued(snapshot: Snapshot, launchedBy: string | null): void {
    this.db
      .prepare(
        `INSERT INTO snapshots (id, project_id, launched_by, status, started_at, pages_crawled, pages_limit, attempts, queued_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?)`,
      )
      .run(
        snapshot.id,
        snapshot.projectId,
        launchedBy,
        snapshot.status,
        snapshot.startedAt.toISOString(),
        snapshot.pagesLimit,
        snapshot.startedAt.toISOString(),
      );
    if (launchedBy !== null) this.journalLaunch(launchedBy, snapshot);
  }

  /** Asking for work proves the worker is alive, so its presence is recorded even on an empty queue. */
  claimNext(workerId: string, now: Date): Promise<Snapshot | null> {
    return this.run(() => {
      this.recordPresence(workerId, now);
      const row = this.db
        .transaction(
          () =>
            this.db
              .prepare(
                `UPDATE snapshots
                 SET status = 'running', attempts = attempts + 1, heartbeat_at = ?
                 WHERE id = (
                   SELECT id FROM snapshots WHERE status = 'queued' ORDER BY queued_at, id LIMIT 1
                 )
                 RETURNING *`,
              )
              .get(now.toISOString()) as SnapshotRow | undefined,
        )
        .immediate();
      return row ? toSnapshot(row) : null;
    });
  }

  finishAttempt(
    id: string,
    attempt: number,
    input: { finishedAt: Date; pagesCrawled: number },
  ): Promise<void> {
    return this.run(() => {
      const { changes } = this.db
        .prepare(
          `UPDATE snapshots SET status = 'finished', finished_at = ?, pages_crawled = ?
           WHERE id = ? AND status = 'running' AND attempts = ?`,
        )
        .run(input.finishedAt.toISOString(), input.pagesCrawled, id, attempt);
      if (changes === 0) throw new AuditAttemptLost(id, attempt);
    });
  }

  heartbeat(id: string, attempt: number, pagesCrawled: number, now: Date): Promise<void> {
    return this.run(() => {
      const { changes } = this.db
        .prepare(
          `UPDATE snapshots SET pages_crawled = ?, heartbeat_at = ?
           WHERE id = ? AND status = 'running' AND attempts = ?`,
        )
        .run(pagesCrawled, now.toISOString(), id, attempt);
      if (changes === 0) throw new AuditAttemptLost(id, attempt);
    });
  }

  failAttempt(id: string, attempt: number, finishedAt: Date): Promise<void> {
    return this.run(() => {
      const { changes } = this.db
        .prepare(
          `UPDATE snapshots SET status = 'failed', finished_at = ?
           WHERE id = ? AND status = 'running' AND attempts = ?`,
        )
        .run(finishedAt.toISOString(), id, attempt);
      if (changes === 0) throw new AuditAttemptLost(id, attempt);
    });
  }

  requeue(id: string, attempt: number, now: Date): Promise<Snapshot> {
    return this.run(() =>
      this.db
        .transaction(() => {
          const row = this.db
            .prepare("SELECT * FROM snapshots WHERE id = ? AND status = 'running' AND attempts = ?")
            .get(id, attempt) as SnapshotRow | undefined;
          if (!row) throw new AuditAttemptLost(id, attempt);
          return this.interrupt(toSnapshot(row), now);
        })
        .immediate(),
    );
  }

  recoverStale(now: Date, staleAfterMs: number): Promise<readonly Snapshot[]> {
    return this.run(() =>
      this.db
        .transaction(() => {
          const rows = this.db
            .prepare(
              "SELECT * FROM snapshots WHERE status = 'running' AND heartbeat_at < ? ORDER BY queued_at, id",
            )
            .all(new Date(now.getTime() - staleAfterMs).toISOString()) as SnapshotRow[];
          return rows.map((row) => this.interrupt(toSnapshot(row), now));
        })
        .immediate(),
    );
  }

  recordWorkerPresence(workerId: string, now: Date): Promise<void> {
    return this.run(() => {
      this.recordPresence(workerId, now);
    });
  }

  private recordPresence(workerId: string, now: Date): void {
    this.db
      .prepare(
        `INSERT INTO workers (id, heartbeat_at) VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET heartbeat_at = excluded.heartbeat_at`,
      )
      .run(workerId, now.toISOString());
  }

  getWorkerPresence(workerId: string): Promise<Date | null> {
    return this.run(() => {
      const row = this.db.prepare('SELECT heartbeat_at FROM workers WHERE id = ?').get(workerId) as
        { heartbeat_at: string } | undefined;
      return row ? new Date(row.heartbeat_at) : null;
    });
  }

  /** Must run in a transaction: the rows of the attempt are deleted along with its state change. */
  private interrupt(snapshot: Snapshot, now: Date): Snapshot {
    const interrupted = snapshot.interrupt(now);
    for (const table of ATTEMPT_TABLES) {
      this.db.prepare(`DELETE FROM ${table} WHERE snapshot_id = ?`).run(snapshot.id);
    }
    this.db
      .prepare(
        `UPDATE snapshots SET status = ?, pages_crawled = 0, heartbeat_at = NULL, finished_at = ?
         WHERE id = ?`,
      )
      .run(interrupted.status, interrupted.finishedAt?.toISOString() ?? null, snapshot.id);
    return interrupted;
  }

  queuePosition(id: string): Promise<number | null> {
    return this.run(() => {
      const row = this.db
        .prepare(
          `SELECT COUNT(*) AS ahead FROM snapshots AS other, snapshots AS me
           WHERE me.id = ? AND me.status = 'queued' AND other.status = 'queued'
             AND (other.queued_at < me.queued_at OR (other.queued_at = me.queued_at AND other.id <= me.id))`,
        )
        .get(id) as { ahead: number };
      return row.ahead === 0 ? null : row.ahead;
    });
  }

  countQueued(): Promise<number> {
    return this.run(
      () =>
        (
          this.db.prepare("SELECT COUNT(*) AS n FROM snapshots WHERE status = 'queued'").get() as {
            n: number;
          }
        ).n,
    );
  }

  countActiveFor(userId: string): Promise<number> {
    return this.run(
      () =>
        (
          this.db
            .prepare(
              "SELECT COUNT(*) AS n FROM snapshots WHERE launched_by = ? AND status IN ('queued', 'running')",
            )
            .get(userId) as { n: number }
        ).n,
    );
  }

  private emailHashOf(userId: string): string | null {
    const row = this.db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as
      { email: string } | undefined;
    return row ? hashToken(row.email) : null;
  }

  private journalLaunch(userId: string, snapshot: Snapshot): void {
    const emailHash = this.emailHashOf(userId);
    if (emailHash === null) return;
    this.db
      .prepare('INSERT INTO api_launches (id, email_hash, launched_at) VALUES (?, ?, ?)')
      .run(snapshot.id, emailHash, snapshot.startedAt.toISOString());
  }

  listLaunchedAtBy(userId: string, since: Date): Promise<readonly Date[]> {
    return this.run(() => {
      const emailHash = this.emailHashOf(userId);
      if (emailHash === null) return [];
      const rows = this.db
        .prepare(
          'SELECT launched_at FROM api_launches WHERE email_hash = ? AND launched_at >= ? ORDER BY launched_at',
        )
        .all(emailHash, since.toISOString()) as { launched_at: string }[];
      return rows.map((row) => new Date(row.launched_at));
    });
  }

  countApiLaunchedSince(since: Date): Promise<number> {
    return this.run(() => {
      const row = this.db
        .prepare('SELECT COUNT(*) AS n FROM api_launches WHERE launched_at >= ?')
        .get(since.toISOString()) as { n: number };
      return row.n;
    });
  }

  addPages(id: string, pages: readonly Page[]): Promise<void> {
    return this.writeToRunning(id, () => {
      const insert = this.db.prepare(
        `INSERT INTO pages (snapshot_id, url, depth, status, error, redirect_target, redirect_chain, headers,
           response_time_ms, content_type, is_html, title, meta_description, canonical, h1, word_count,
           text_ratio, content_hash, blocked_by_robots)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const page of pages) {
        insert.run(
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
          page.isHtml ? 1 : 0,
          page.title,
          page.metaDescription,
          page.canonical,
          JSON.stringify(page.h1),
          page.wordCount,
          page.textRatio,
          page.contentHash,
          page.blockedByRobots ? 1 : 0,
        );
      }
    });
  }

  addLinks(id: string, links: readonly Link[]): Promise<void> {
    return this.writeToRunning(id, () => {
      const insert = this.db.prepare(
        'INSERT INTO links (snapshot_id, source_url, target_url, type, rel, anchor) VALUES (?, ?, ?, ?, ?, ?)',
      );
      for (const link of links) {
        insert.run(id, link.sourceUrl, link.targetUrl, link.type, link.rel, link.anchor);
      }
    });
  }

  addSiteFiles(id: string, files: readonly SiteFile[]): Promise<void> {
    return this.writeToRunning(id, () => {
      const insert = this.db.prepare(
        'INSERT INTO site_files (snapshot_id, kind, url, status, error) VALUES (?, ?, ?, ?, ?)',
      );
      for (const file of files) insert.run(id, file.kind, file.url, file.status, file.error);
    });
  }

  addHostProbe(id: string, probe: HostProbe): Promise<void> {
    return this.writeToRunning(id, () => {
      this.db
        .prepare(
          'INSERT INTO host_probes (snapshot_id, url, status, error, is_html, canonical) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, probe.url, probe.status, probe.error, probe.isHtml ? 1 : 0, probe.canonical);
    });
  }

  addSlashProbes(id: string, probes: readonly SlashVariantProbe[]): Promise<void> {
    return this.writeToRunning(id, () => {
      const insert = this.db.prepare(
        'INSERT INTO slash_probes (snapshot_id, url, source_page_url, status, error, is_html, canonical) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      for (const probe of probes) {
        insert.run(
          id,
          probe.url,
          probe.sourcePageUrl,
          probe.status,
          probe.error,
          probe.isHtml ? 1 : 0,
          probe.canonical,
        );
      }
    });
  }

  addCheckResults(id: string, results: readonly CheckResult[]): Promise<void> {
    return this.writeToRunning(id, () => {
      const insertResult = this.db.prepare(
        'INSERT INTO check_results (snapshot_id, check_id, severity, theme, count, examined) VALUES (?, ?, ?, ?, ?, ?)',
      );
      const insertOccurrence = this.db.prepare(
        'INSERT INTO issue_occurrences (snapshot_id, check_id, page_url, info) VALUES (?, ?, ?, ?)',
      );
      for (const result of results) {
        insertResult.run(
          id,
          result.checkId,
          result.severity,
          result.theme,
          result.count,
          result.examined,
        );
        for (const occurrence of result.occurrences) {
          insertOccurrence.run(
            id,
            occurrence.checkId,
            occurrence.pageUrl,
            JSON.stringify(occurrence.info),
          );
        }
      }
    });
  }

  finish(id: string, input: { finishedAt: Date; pagesCrawled: number }): Promise<void> {
    return this.writeToRunning(id, (snapshot) => {
      const finished = snapshot.finish(input.finishedAt, input.pagesCrawled);
      this.db
        .prepare('UPDATE snapshots SET status = ?, finished_at = ?, pages_crawled = ? WHERE id = ?')
        .run(finished.status, input.finishedAt.toISOString(), input.pagesCrawled, id);
    });
  }

  fail(id: string, finishedAt: Date): Promise<void> {
    return this.writeToRunning(id, (snapshot) => {
      const failed = snapshot.fail(finishedAt);
      this.db
        .prepare('UPDATE snapshots SET status = ?, finished_at = ? WHERE id = ?')
        .run(failed.status, finishedAt.toISOString(), id);
    });
  }

  getById(id: string): Promise<SnapshotDetails | null> {
    return this.run(() => {
      const row = this.db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as
        SnapshotRow | undefined;
      if (!row) return null;
      return {
        snapshot: toSnapshot(row),
        pages: (
          this.db
            .prepare('SELECT * FROM pages WHERE snapshot_id = ? ORDER BY id')
            .all(id) as PageRow[]
        ).map(toPage),
        links: (
          this.db
            .prepare('SELECT * FROM links WHERE snapshot_id = ? ORDER BY id')
            .all(id) as LinkRow[]
        ).map(toLink),
        checkResults: this.readCheckResults(id),
        siteFiles: (
          this.db
            .prepare('SELECT * FROM site_files WHERE snapshot_id = ? ORDER BY kind, url, id')
            .all(id) as SiteFileRow[]
        ).map(toSiteFile),
        hostProbe: this.readHostProbe(id),
        slashProbes: (
          this.db
            .prepare(
              'SELECT * FROM slash_probes WHERE snapshot_id = ? ORDER BY source_page_url, url, id',
            )
            .all(id) as SlashProbeRow[]
        ).map(toSlashProbe),
      };
    });
  }

  listByProject(projectId: string): Promise<readonly Snapshot[]> {
    return this.run(() =>
      (
        this.db
          .prepare('SELECT * FROM snapshots WHERE project_id = ? ORDER BY started_at DESC, id')
          .all(projectId) as SnapshotRow[]
      ).map(toSnapshot),
    );
  }

  listRunning(): Promise<readonly Snapshot[]> {
    return this.run(() =>
      (
        this.db
          .prepare("SELECT * FROM snapshots WHERE status = 'running' ORDER BY started_at DESC, id")
          .all() as SnapshotRow[]
      ).map(toSnapshot),
    );
  }

  findPreviousFinished(projectId: string, beforeStartedAt: Date): Promise<Snapshot | null> {
    return this.run(() => {
      const row = this.db
        .prepare(
          `SELECT * FROM snapshots
           WHERE project_id = ? AND status = 'finished' AND started_at < ?
           ORDER BY started_at DESC, id LIMIT 1`,
        )
        .get(projectId, beforeStartedAt.toISOString()) as SnapshotRow | undefined;
      return row ? toSnapshot(row) : null;
    });
  }

  private readHostProbe(id: string): HostProbe | null {
    const row = this.db.prepare('SELECT * FROM host_probes WHERE snapshot_id = ?').get(id) as
      HostProbeRow | undefined;
    return row ? toHostProbe(row) : null;
  }

  private readCheckResults(id: string): CheckResult[] {
    const occurrences = this.db
      .prepare(
        'SELECT check_id, page_url, info FROM issue_occurrences WHERE snapshot_id = ? ORDER BY id',
      )
      .all(id) as OccurrenceRow[];
    const results = this.db
      .prepare('SELECT * FROM check_results WHERE snapshot_id = ? ORDER BY id')
      .all(id) as CheckResultRow[];
    return results.map((row) => ({
      checkId: row.check_id,
      severity: row.severity,
      theme: toTheme(row.theme),
      count: row.count,
      examined: row.examined,
      occurrences: occurrences
        .filter((occurrence) => occurrence.check_id === row.check_id)
        .map((occurrence): IssueOccurrence => ({
          checkId: occurrence.check_id,
          pageUrl: occurrence.page_url,
          info: JSON.parse(occurrence.info) as Record<string, unknown>,
        })),
    }));
  }

  /** The status check and the write share one transaction so a finished snapshot is never touched. */
  private writeToRunning(id: string, write: (snapshot: Snapshot) => void): Promise<void> {
    return this.run(() => {
      this.db.transaction(() => {
        const row = this.db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as
          SnapshotRow | undefined;
        if (!row) throw new SnapshotNotFound(id);
        const snapshot = toSnapshot(row);
        snapshot.assertWritable();
        write(snapshot);
      })();
    });
  }

  private run<T>(operation: () => T): Promise<T> {
    try {
      return Promise.resolve(operation());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
