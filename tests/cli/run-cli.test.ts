import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../../src/cli/run-cli.js';
import { SqliteSnapshotRepository } from '../../src/infrastructure/sqlite/sqlite-snapshot-repository.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';

const html = (...hrefs: string[]) => ({
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: `<html><head><title>Page de test pour le crawler</title></head><body><h1>Titre</h1>${hrefs
    .map((href) => `<a href="${href}">lien</a>`)
    .join('')}</body></html>`,
});

const SITE = {
  '/': html('/a', '/b', '/c', '/d'),
  '/a': html('/'),
  '/b': html('/'),
  '/c': html('/'),
  '/d': html('/'),
};

interface Captured {
  io: CliIo;
  out: string;
  err: string;
}

const capture = (stderrIsTty = false): Captured => {
  const captured: Captured = {
    out: '',
    err: '',
    io: {
      stdout: (text) => {
        captured.out += text;
      },
      stderr: (text) => {
        captured.err += text;
      },
      stderrIsTty,
    },
  };
  return captured;
};

describe('runCli', () => {
  let server: FixtureServer;
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    server = await startFixtureServer(SITE);
    dir = mkdtempSync(join(tmpdir(), 'zero-audit-cli-'));
    dbPath = join(dir, 'audit.db');
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const snapshots = async (id: string) => {
    const repository = SqliteSnapshotRepository.open(dbPath);
    try {
      return await repository.getById(id);
    } finally {
      repository.close();
    }
  };

  it('records the audit in a project without owner, launched by nobody, under no quota', async () => {
    const code = await runCli(
      [server.baseUrl, '--limit', '10', '--direct', '--delay', '0', '--db', dbPath],
      { ZERO_AUDIT_LAUNCHES_PER_DAY: '1' },
      capture().io,
    );

    expect(code).toBe(0);
    const db = new Database(dbPath, { readonly: true });
    try {
      expect(db.prepare('SELECT launched_by FROM snapshots').all()).toEqual([
        { launched_by: null },
      ]);
      expect(db.prepare('SELECT owner_id FROM projects').all()).toEqual([{ owner_id: null }]);
    } finally {
      db.close();
    }
  });

  it('audits a 5-page site, prints the summary and persists a finished snapshot', async () => {
    const run = capture();
    const jsonPath = join(dir, 'out', 'audit.json');

    const code = await runCli(
      [
        server.baseUrl,
        '--limit',
        '10',
        '--direct',
        '--delay',
        '0',
        '--db',
        dbPath,
        '--json',
        jsonPath,
      ],
      {},
      run.io,
    );

    expect(code).toBe(0);
    const exported = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
      snapshot: { id: string; status: string; pagesCrawled: number; pagesLimit: number };
      pages: unknown[];
      siteFiles: { kind: string; status: number | null }[];
      links: unknown[];
      checkResults: { count: number }[];
      pageGroups: { counts: Record<string, number>; variation: Record<string, number | null> };
      scores: {
        health: { score: number | null };
        themes: Record<string, { score: number | null }>;
      };
    };
    expect(exported.pageGroups.counts.healthy).toEqual(expect.any(Number));
    expect(exported.pageGroups.variation.healthy).toBeNull();
    expect(run.out).toContain('Pages par groupe');
    expect(exported.scores.health.score).toEqual(expect.any(Number));
    expect(exported.scores.themes.https).toEqual({ score: 0, variation: null });
    expect(run.out).toMatch(/Santé du site : \d+\n/);
    expect(run.out).not.toContain('/ 100');
    expect(run.out).toMatch(/https : 0\b/);
    expect(exported.snapshot).toMatchObject({
      status: 'finished',
      pagesCrawled: 5,
      pagesLimit: 10,
    });
    expect(exported.pages).toHaveLength(5);
    expect(exported.siteFiles.map(({ kind }) => kind)).toEqual(['llms', 'robots', 'sitemap']);
    expect(run.out).toContain('llms.txt :');
    expect(exported.links.length).toBeGreaterThan(0);
    expect(exported.checkResults).toHaveLength(44);
    expect(exported.checkResults.some((result) => result.count === 0)).toBe(true);

    const stored = await snapshots(exported.snapshot.id);
    expect(stored?.snapshot).toMatchObject({ status: 'finished', pagesCrawled: 5, pagesLimit: 10 });

    expect(run.out).toContain(exported.snapshot.id);
    expect(run.out).toMatch(/2xx : 5/);
    expect(run.out).toMatch(/ – .* – \d+ \/ \d+/);
    expect(run.out).not.toMatch(/ – 0 \/ /);
    expect(run.out).not.toContain('5/10');
    expect(run.err.endsWith('5/10\n')).toBe(true);
  });

  it('reports zero deltas in the console and the JSON export for two audits of an unchanged site', async () => {
    const args = [server.baseUrl, '--limit', '10', '--direct', '--delay', '0', '--db', dbPath];
    await runCli(args, {}, capture().io);
    const jsonPath = join(dir, 'second.json');
    const second = capture();

    await runCli([...args, '--json', jsonPath], {}, second.io);

    const exported = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
      checkResults: { delta: number; newCount: number; fixedCount: number }[];
      scores: { health: { score: number; variation: number | null } };
    };
    expect(Number.isInteger(exported.scores.health.score)).toBe(true);
    expect(exported.scores.health.variation).toBe(0);
    expect(exported.checkResults).toHaveLength(44);
    for (const result of exported.checkResults) {
      expect(result).toMatchObject({ delta: 0, newCount: 0, fixedCount: 0 });
    }
    expect(second.out).toMatch(/ – Δ 0 – nouvelles 0 – corrigées 0/);
    expect(second.out).toMatch(/Santé du site : \d+ \(0\)\n/);
    expect(second.out).not.toContain('/ 100');
    expect(second.out).not.toMatch(/nouvelles [1-9]/);
  });

  it('rewrites a single progress line on a terminal', async () => {
    const run = capture(true);

    await runCli(
      [server.baseUrl, '--limit', '10', '--direct', '--delay', '0', '--db', dbPath],
      {},
      run.io,
    );

    expect(run.err).toContain('\r\u001B[2K5/10');
    expect(run.err.endsWith('\n')).toBe(true);
    expect(run.err.trimEnd().split('\n')).toHaveLength(1);
  });

  it('exits 1, explains on stderr and marks the snapshot failed when the root is unreachable', async () => {
    const closedPort = await startFixtureServer({});
    const closedUrl = closedPort.baseUrl;
    await closedPort.close();
    const run = capture();

    const code = await runCli([closedUrl, '--direct', '--delay', '0', '--db', dbPath], {}, run.io);

    expect(code).toBe(1);
    expect(run.err).toContain('unreachable');
    expect(
      run.out
        .trimEnd()
        .split('\n')
        .map((line) => (JSON.parse(line) as { event: string }).event),
    ).toEqual(['audit.started', 'audit.failed']);
    const db = new Database(dbPath, { readonly: true });
    expect(db.prepare('SELECT status FROM snapshots').all()).toEqual([{ status: 'failed' }]);
    db.close();
  });

  it.each([
    [[]],
    [['not a url']],
    [['http://x.test', '--limit', '0']],
    [['http://x.test', '--delay', '-1']],
    [['serve']],
  ])('exits 2 with usage and no side effect for %j', async (argv) => {
    const run = capture();

    const code = await runCli([...argv, '--db', dbPath], {}, run.io);

    expect(code).toBe(2);
    expect(run.err).toContain('Usage');
    expect(run.out).toBe('');
    expect(server.requests).toHaveLength(0);
    expect(existsSync(dbPath)).toBe(false);
  });

  it('prints the help on stdout and exits 0', async () => {
    const run = capture();

    const code = await runCli(['--help'], {}, run.io);

    expect(code).toBe(0);
    for (const token of ['url', '--limit', '--delay', '--db', '--json']) {
      expect(run.out).toContain(token);
    }
  });

  describe('compare', () => {
    const auditId = async (url: string): Promise<string> => {
      const jsonPath = join(dir, `${String(Math.random())}.json`);
      await runCli(
        [url, '--limit', '10', '--direct', '--delay', '0', '--db', dbPath, '--json', jsonPath],
        {},
        capture().io,
      );
      return (JSON.parse(readFileSync(jsonPath, 'utf8')) as { snapshot: { id: string } }).snapshot
        .id;
    };

    it('reports no difference between two audits of an unchanged site and exits 0', async () => {
      const a = await auditId(server.baseUrl);
      const b = await auditId(server.baseUrl);
      const run = capture();

      const code = await runCli(['compare', a, b, '--db', dbPath], {}, run.io);

      expect(code).toBe(0);
      expect(run.out).toContain('Aucune différence');
      expect(run.out).toMatch(/Δ 0 – nouvelles 0 – corrigées 0/);
      expect(run.out).toMatch(/Santé du site : A (\d+) → B \1 \(0\)/);
      expect(run.out).toMatch(/on-page : A \d+ → B \d+ \(0\)/);
    });

    it('lists occurrences added between two audits', async () => {
      const a = await auditId(server.baseUrl);
      const repository = SqliteSnapshotRepository.open(dbPath);
      const base = await repository.getById(a);
      const projectId = base?.snapshot.projectId ?? '';
      const target = await repository.create({
        launchedBy: null,
        projectId,
        pagesLimit: 10,
        startedAt: new Date(),
      });
      await repository.addCheckResults(target.id, [
        {
          checkId: 15,
          severity: 'warning',
          theme: 'on-page',
          count: 1,
          examined: 1,
          occurrences: [{ checkId: 15, pageUrl: 'https://added.test/x', info: {} }],
        },
      ]);
      await repository.finish(target.id, { finishedAt: new Date(), pagesCrawled: 1 });
      repository.close();
      const run = capture();

      const code = await runCli(['compare', a, target.id, '--db', dbPath], {}, run.io);

      expect(code).toBe(0);
      expect(run.out).toContain('+ https://added.test/x');
      expect(run.out).toMatch(/15 – .* – A 0 → B 1 – Δ \+1 – nouvelles 1/);
    });

    it('refuses snapshots of two different sites', async () => {
      const other = await startFixtureServer(SITE);
      const a = await auditId(server.baseUrl);
      const b = await auditId(other.baseUrl);
      await other.close();
      const run = capture();

      const code = await runCli(['compare', a, b, '--db', dbPath], {}, run.io);

      expect(code).not.toBe(0);
      expect(run.err).toContain('pas du même site');
    });

    it('refuses a target that is not finished', async () => {
      const a = await auditId(server.baseUrl);
      const repository = SqliteSnapshotRepository.open(dbPath);
      const projectId = (await repository.getById(a))?.snapshot.projectId ?? '';
      const running = await repository.create({
        launchedBy: null,
        projectId,
        pagesLimit: 1,
        startedAt: new Date(),
      });
      repository.close();
      const run = capture();

      const code = await runCli(['compare', a, running.id, '--db', dbPath], {}, run.io);

      expect(code).not.toBe(0);
      expect(run.err).toContain('pas terminé');
    });

    it('reports an unknown snapshot', async () => {
      const a = await auditId(server.baseUrl);
      const run = capture();

      const code = await runCli(['compare', a, 'inconnu', '--db', dbPath], {}, run.io);

      expect(code).not.toBe(0);
      expect(run.err).toContain('introuvable');
    });

    it('prints the usage and exits 2 when the second snapshot is missing', async () => {
      const run = capture();

      const code = await runCli(['compare', 'a', '--db', dbPath], {}, run.io);

      expect(code).toBe(2);
      expect(run.err).toContain('Usage');
      expect(existsSync(dbPath)).toBe(false);
    });
  });
});
