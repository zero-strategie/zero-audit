import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run-cli.js';
import { startFixtureServer, type FixtureServer } from '../support/fixture-server.js';

const PAGE = {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: '<html><head><title>Page de test pour le crawler</title></head><body><h1>Titre</h1></body></html>',
};

const run = async (args: string[]) => {
  let out = '';
  let err = '';
  const code = await runCli(
    args,
    {},
    {
      stdout: (text) => {
        out += text;
      },
      stderr: (text) => {
        err += text;
      },
      stderrIsTty: false,
    },
  );
  return { code, out, err };
};

const eventLines = (text: string): Record<string, unknown>[] =>
  text
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);

describe('runCli audit events', () => {
  let server: FixtureServer;
  let dir: string;

  beforeEach(async () => {
    server = await startFixtureServer({ '/': PAGE });
    dir = mkdtempSync(join(tmpdir(), 'zero-audit-events-'));
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes audit.started then audit.finished on stdout and no event on stderr', async () => {
    const { code, out, err } = await run([
      server.baseUrl,
      '--delay',
      '0',
      '--db',
      join(dir, 'a.db'),
    ]);

    expect(code).toBe(0);
    const events = eventLines(out);
    expect(events.map((event) => event['event'])).toEqual(['audit.started', 'audit.finished']);
    expect(events[1]).toMatchObject({
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/) as string,
      snapshotId: events[0]?.['snapshotId'],
      rootUrl: server.baseUrl,
      pagesCount: 1,
      health: expect.any(Number) as number,
    });
    expect(eventLines(err)).toEqual([]);
    expect(err).toContain('1');
  });

  it('writes audit.failed without stack trace when the crawl fails', async () => {
    const { code, out } = await run([
      'http://127.0.0.1:1/',
      '--delay',
      '0',
      '--db',
      join(dir, 'b.db'),
    ]);

    expect(code).toBe(1);
    const events = eventLines(out);
    expect(events.map((event) => event['event'])).toEqual(['audit.started', 'audit.failed']);
    expect(Object.keys(events[1] ?? {}).sort()).toEqual([
      'event',
      'rootUrl',
      'snapshotId',
      'timestamp',
    ]);
  });
});
