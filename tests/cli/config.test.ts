import { describe, expect, it } from 'vitest';
import { parseCommand, type AuditConfig } from '../../src/cli/config.js';
import { USAGE } from '../../src/cli/usage.js';

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
      mode: 'queue',
      workerConcurrency: 1,
      store: 'sqlite',
      databaseUrl: null,
    });
  });
});

describe('parseCommand audit mode', () => {
  it('waits for the worker with --wait', () => {
    expect(auditConfig([URL_ARG, '--wait']).mode).toBe('wait');
  });

  it('crawls in the process with --direct', () => {
    expect(auditConfig([URL_ARG, '--direct']).mode).toBe('direct');
  });

  it('reads the concurrency of the worker to look for when waiting', () => {
    expect(
      auditConfig([URL_ARG, '--wait'], { ZERO_AUDIT_WORKER_CONCURRENCY: '3' }).workerConcurrency,
    ).toBe(3);
  });

  it('does not read the concurrency of the worker without --wait', () => {
    expect(
      auditConfig([URL_ARG, '--direct'], { ZERO_AUDIT_WORKER_CONCURRENCY: 'x' }).workerConcurrency,
    ).toBe(1);
  });

  it('rejects --wait together with --direct', () => {
    expect(parseCommand([URL_ARG, '--wait', '--direct'], {}).kind).toBe('usage-error');
  });

  it('rejects an unknown flag', () => {
    expect(parseCommand([URL_ARG, '--bogus'], {}).kind).toBe('usage-error');
  });
});

describe('parseCommand worker', () => {
  it('defaults to one audit at a time, the SSRF guard on and the default storage', () => {
    expect(parseCommand(['worker'], {})).toEqual({
      kind: 'worker',
      concurrency: 1,
      allowPrivateTargets: false,
      delayMs: 1000,
      dbPath: './.zero-audit/audit.db',
      store: 'sqlite',
      databaseUrl: null,
    });
  });

  it('reads the concurrency, the delay and the private-target switch from the environment', () => {
    expect(
      parseCommand(['worker'], {
        ZERO_AUDIT_WORKER_CONCURRENCY: '3',
        ZERO_AUDIT_DELAY_MS: '250',
        ZERO_AUDIT_ALLOW_PRIVATE_TARGETS: 'true',
      }),
    ).toMatchObject({ concurrency: 3, delayMs: 250, allowPrivateTargets: true });
  });

  it.each(['0', '-1', '1.5', 'abc', ''])('rejects the concurrency "%s"', (value) => {
    const command = parseCommand(['worker'], { ZERO_AUDIT_WORKER_CONCURRENCY: value });

    expect(command).toMatchObject({ kind: 'usage-error' });
    expect(command.kind === 'usage-error' && command.message).toContain(
      'ZERO_AUDIT_WORKER_CONCURRENCY',
    );
  });
});

describe('parseCommand worker-health', () => {
  it('uses the storage selection and the concurrency of the worker', () => {
    expect(
      parseCommand(['worker-health', '--db', 'x.db'], { ZERO_AUDIT_WORKER_CONCURRENCY: '2' }),
    ).toEqual({
      kind: 'worker-health',
      concurrency: 2,
      dbPath: 'x.db',
      store: 'sqlite',
      databaseUrl: null,
    });
  });

  it('rejects an invalid concurrency', () => {
    expect(parseCommand(['worker-health'], { ZERO_AUDIT_WORKER_CONCURRENCY: '0' }).kind).toBe(
      'usage-error',
    );
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

  it('rejects `serve` as a usage error: the command no longer exists', () => {
    expect(parseCommand(['serve'], {}).kind).toBe('usage-error');
  });

  it('does not mention serve in the usage', () => {
    expect(USAGE).not.toContain('serve');
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

describe('parseCommand migrate', () => {
  it('parses `migrate` with the SQLite defaults', () => {
    expect(parseCommand(['migrate'], {})).toEqual({
      kind: 'migrate',
      dbPath: './.zero-audit/audit.db',
      store: 'sqlite',
      databaseUrl: null,
    });
  });

  it('reads --store and --db', () => {
    expect(parseCommand(['migrate', '--store', 'sqlite', '--db', 'x.db'], {})).toMatchObject({
      kind: 'migrate',
      dbPath: 'x.db',
    });
  });

  it('requires DATABASE_URL for postgres', () => {
    expect(parseCommand(['migrate', '--store', 'postgres'], {})).toMatchObject({
      kind: 'usage-error',
      message: expect.stringContaining('DATABASE_URL') as string,
    });
  });

  it('rejects an unknown option', () => {
    expect(parseCommand(['migrate', '--foo'], {}).kind).toBe('usage-error');
  });

  it('is listed in the usage', () => {
    expect(USAGE).toContain('migrate');
  });
});

describe('usage of the worker commands', () => {
  it.each(['worker', 'worker-health', '--wait', '--direct', 'ZERO_AUDIT_WORKER_CONCURRENCY'])(
    'mentions %s',
    (token) => {
      expect(USAGE).toContain(token);
    },
  );

  it('is what --help prints', () => {
    expect(parseCommand(['--help'], {})).toEqual({ kind: 'help' });
  });
});
