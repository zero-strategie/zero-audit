import { randomUUID } from 'node:crypto';
import type pg from 'pg';
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
import { SnapshotNotFound } from '../../domain/errors.js';
import { toTheme } from '../../domain/legacy-theme.js';
import { Snapshot, type SnapshotStatus } from '../../domain/snapshot.js';
import { withTransaction } from './pool.js';
import { PostgresProjectRepository } from './postgres-project-repository.js';
import { PostgresEmailTokenRepository } from './postgres-email-token-repository.js';
import { PostgresSessionRepository } from './postgres-session-repository.js';
import { PostgresUserRepository } from './postgres-user-repository.js';

type Queryable = pg.Pool | pg.PoolClient;

type SnapshotRow = {
  id: string;
  project_id: string;
  status: SnapshotStatus;
  started_at: Date;
  finished_at: Date | null;
  pages_crawled: number;
  pages_limit: number;
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
};

type LinkRow = {
  source_url: string;
  target_url: string;
  type: LinkType;
  rel: string | null;
  anchor: string | null;
};

type SiteFileRow = {
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

const toSnapshot = (row: SnapshotRow): Snapshot =>
  Snapshot.restore({
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    pagesCrawled: row.pages_crawled,
    pagesLimit: row.pages_limit,
  });

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
  isHtml: row.is_html,
  canonical: row.canonical,
});

const toSlashProbe = (row: SlashProbeRow): SlashVariantProbe => ({
  ...toHostProbe(row),
  sourcePageUrl: row.source_page_url,
});

export class PostgresSnapshotRepository implements SnapshotRepository {
  readonly projects: PostgresProjectRepository;
  readonly users: PostgresUserRepository;
  readonly sessions: PostgresSessionRepository;
  readonly emailTokens: PostgresEmailTokenRepository;

  constructor(private readonly pool: pg.Pool) {
    this.projects = new PostgresProjectRepository(pool);
    this.users = new PostgresUserRepository(pool);
    this.sessions = new PostgresSessionRepository(pool);
    this.emailTokens = new PostgresEmailTokenRepository(pool);
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
    await this.pool.query(
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
    return snapshot;
  }

  async countLaunchedBy(userId: string, since: Date): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      'SELECT COUNT(*) AS n FROM snapshots WHERE launched_by = $1 AND started_at >= $2',
      [userId, since],
    );
    return Number(rows[0]?.n);
  }

  async countApiLaunchedSince(since: Date): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      'SELECT COUNT(*) AS n FROM snapshots WHERE launched_by IS NOT NULL AND started_at >= $1',
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
             word_count, text_ratio, content_hash, blocked_by_robots)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
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
          'INSERT INTO site_files (snapshot_id, kind, url, status, error) VALUES ($1, $2, $3, $4, $5)',
          [id, file.kind, file.url, file.status, file.error],
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
