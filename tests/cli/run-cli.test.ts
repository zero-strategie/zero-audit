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

  it('audits a 5-page site, prints the summary and persists a finished snapshot', async () => {
    const run = capture();
    const jsonPath = join(dir, 'out', 'audit.json');

    const code = await runCli(
      [server.baseUrl, '--limit', '10', '--delay', '0', '--db', dbPath, '--json', jsonPath],
      {},
      run.io,
    );

    expect(code).toBe(0);
    const exported = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
      snapshot: { id: string; status: string; pagesCrawled: number; pagesLimit: number };
      pages: unknown[];
      links: unknown[];
      checkResults: { count: number }[];
    };
    expect(exported.snapshot).toMatchObject({
      status: 'finished',
      pagesCrawled: 5,
      pagesLimit: 10,
    });
    expect(exported.pages).toHaveLength(5);
    expect(exported.links.length).toBeGreaterThan(0);
    expect(exported.checkResults).toHaveLength(15);
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

  it('rewrites a single progress line on a terminal', async () => {
    const run = capture(true);

    await runCli([server.baseUrl, '--limit', '10', '--delay', '0', '--db', dbPath], {}, run.io);

    expect(run.err).toContain('\r\u001B[2K5/10');
    expect(run.err.endsWith('\n')).toBe(true);
    expect(run.err.trimEnd().split('\n')).toHaveLength(1);
  });

  it('exits 1, explains on stderr and marks the snapshot failed when the root is unreachable', async () => {
    const closedPort = await startFixtureServer({});
    const closedUrl = closedPort.baseUrl;
    await closedPort.close();
    const run = capture();

    const code = await runCli([closedUrl, '--delay', '0', '--db', dbPath], {}, run.io);

    expect(code).toBe(1);
    expect(run.err).toContain('unreachable');
    expect(run.out).toBe('');
    const db = new Database(dbPath, { readonly: true });
    expect(db.prepare('SELECT status FROM snapshots').all()).toEqual([{ status: 'failed' }]);
    db.close();
  });

  it.each([
    [[]],
    [['not a url']],
    [['http://x.test', '--limit', '0']],
    [['http://x.test', '--delay', '-1']],
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
});
