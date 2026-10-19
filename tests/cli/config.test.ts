import { describe, expect, it } from 'vitest';
import { parseCommand, type AuditConfig } from '../../src/cli/config.js';

const URL_ARG = 'https://exemple.com/';

const auditConfig = (argv: string[], env: Record<string, string> = {}): AuditConfig => {
  const parsed = parseCommand(argv, env);
  if (parsed.kind !== 'audit') throw new Error(`expected audit, got ${parsed.kind}`);
  return parsed.config;
};

describe('parseCommand defaults', () => {
  it('uses limit 100, delay 1000 ms, default db and no json export', () => {
    expect(auditConfig([URL_ARG])).toEqual({
      rootUrl: URL_ARG,
      limit: 100,
      delayMs: 1000,
      dbPath: './.zero-audit/audit.db',
      jsonPath: null,
      store: 'sqlite',
      databaseUrl: null,
    });
  });
});

describe('parseCommand storage selection', () => {
  const POSTGRES_URL = 'postgresql://user:pw@localhost:5432/db';

  it('lets --store win over ZERO_AUDIT_STORE', () => {
    const env = { ZERO_AUDIT_STORE: 'postgres', DATABASE_URL: POSTGRES_URL };
    expect(auditConfig([URL_ARG], env).store).toBe('postgres');
    expect(auditConfig([URL_ARG, '--store', 'sqlite'], env).store).toBe('sqlite');
  });

  it('reads DATABASE_URL for postgres, for audit and compare', () => {
    const env = { DATABASE_URL: POSTGRES_URL };
    expect(auditConfig([URL_ARG, '--store', 'postgres'], env).databaseUrl).toBe(POSTGRES_URL);
    expect(parseCommand(['compare', 'a', 'b', '--store', 'postgres'], env)).toMatchObject({
      kind: 'compare',
      store: 'postgres',
      databaseUrl: POSTGRES_URL,
    });
  });

  it('lists the accepted values when the store is unknown', () => {
    expect(parseCommand([URL_ARG, '--store', 'mysql'], {})).toEqual({
      kind: 'usage-error',
      message: '--store must be one of: sqlite, postgres (received "mysql")',
    });
  });

  it('asks for DATABASE_URL when postgres is chosen without it', () => {
    const parsed = parseCommand([URL_ARG, '--store', 'postgres'], {});
    expect(parsed).toMatchObject({ kind: 'usage-error' });
    expect(parsed.kind === 'usage-error' && parsed.message).toContain('DATABASE_URL');
  });
});

describe('parseCommand precedence option > environment > default', () => {
  it('reads the delay from ZERO_AUDIT_DELAY_MS, overridden by --delay', () => {
    const env = { ZERO_AUDIT_DELAY_MS: '500' };
    expect(auditConfig([URL_ARG], env).delayMs).toBe(500);
    expect(auditConfig([URL_ARG, '--delay', '0'], env).delayMs).toBe(0);
  });

  it('reads the database from ZERO_AUDIT_DB_PATH, overridden by --db', () => {
    const env = { ZERO_AUDIT_DB_PATH: '/tmp/env.db' };
    expect(auditConfig([URL_ARG], env).dbPath).toBe('/tmp/env.db');
    expect(auditConfig([URL_ARG, '--db', '/tmp/opt.db'], env).dbPath).toBe('/tmp/opt.db');
  });

  it('reads --limit and --json', () => {
    const config = auditConfig([URL_ARG, '--limit', '10', '--json', 'out.json']);
    expect(config.limit).toBe(10);
    expect(config.jsonPath).toBe('out.json');
  });
});

describe('parseCommand help', () => {
  it('returns help for --help', () => {
    expect(parseCommand(['--help'], {})).toEqual({ kind: 'help' });
  });
});

describe('parseCommand usage errors', () => {
  it.each([
    ['missing url', []],
    ['invalid url', ['not a url']],
    ['non-http url', ['ftp://exemple.com/']],
    ['limit 0', [URL_ARG, '--limit', '0']],
    ['limit abc', [URL_ARG, '--limit', 'abc']],
    ['limit 1.5', [URL_ARG, '--limit', '1.5']],
    ['negative delay', [URL_ARG, '--delay', '-1']],
    ['unknown option', [URL_ARG, '--bogus']],
    ['two urls', [URL_ARG, URL_ARG]],
  ])('rejects %s', (_name, argv) => {
    expect(parseCommand(argv, {}).kind).toBe('usage-error');
  });

  it('rejects an invalid ZERO_AUDIT_DELAY_MS', () => {
    expect(parseCommand([URL_ARG], { ZERO_AUDIT_DELAY_MS: 'x' }).kind).toBe('usage-error');
  });
});

describe('parseCommand subcommands', () => {
  it('treats `audit <url>` like `<url>`', () => {
    const argv = [URL_ARG, '--limit', '5'];
    expect(parseCommand(['audit', ...argv], {})).toEqual(parseCommand(argv, {}));
    expect(parseCommand(['audit', ...argv], {}).kind).toBe('audit');
  });

  it('parses `serve` as a serve command, never as a URL', () => {
    expect(parseCommand(['serve'], {})).toEqual({
      kind: 'serve',
      port: 3000,
      dbPath: './.zero-audit/audit.db',
      store: 'sqlite',
      databaseUrl: null,
    });
  });

  it('reads the serve port from --port', () => {
    expect(parseCommand(['serve', '--port', '4000'], {})).toMatchObject({ port: 4000 });
  });

  it.each(['abc', '0', '65536', '-1', '30.5'])('rejects the serve port "%s"', (port) => {
    const command = parseCommand(['serve', '--port', port], {});

    expect(command.kind).toBe('usage-error');
    expect(command).toMatchObject({ message: expect.stringContaining('--port') as string });
  });

  it('applies --store and --db to serve', () => {
    expect(
      parseCommand(['serve', '--store', 'postgres', '--db', 'x.db'], {
        DATABASE_URL: 'postgresql://h/d',
      }),
    ).toMatchObject({ store: 'postgres', databaseUrl: 'postgresql://h/d', dbPath: 'x.db' });
  });

  it('parses `compare <A> <B>` with the database path', () => {
    expect(parseCommand(['compare', 'a1', 'b2', '--db', '/tmp/x.db'], {})).toEqual({
      kind: 'compare',
      baseId: 'a1',
      targetId: 'b2',
      dbPath: '/tmp/x.db',
      store: 'sqlite',
      databaseUrl: null,
    });
    expect(
      parseCommand(['compare', 'a1', 'b2'], { ZERO_AUDIT_DB_PATH: '/tmp/e.db' }),
    ).toMatchObject({
      dbPath: '/tmp/e.db',
    });
  });

  it.each([
    ['no snapshot', ['compare']],
    ['a single snapshot', ['compare', 'a1']],
    ['three snapshots', ['compare', 'a', 'b', 'c']],
    ['an unknown option', ['compare', 'a', 'b', '--bogus']],
    ['audit without url', ['audit']],
  ])('rejects compare/audit with %s', (_name, argv) => {
    expect(parseCommand(argv, {}).kind).toBe('usage-error');
  });
});
