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
      host: '127.0.0.1',
      port: 3000,
      dbPath: './.zero-audit/audit.db',
      store: 'sqlite',
      databaseUrl: null,
      allowPrivateTargets: false,
      delayMs: 1000,
      mail: { kind: 'disabled', from: 'no-reply@agents.zero-strategie.dev', publicUrl: null },
      adminEmails: [],
      launchesPerDay: 30,
    });
  });

  it.each([
    ['true', true],
    ['TRUE', false],
    ['1', false],
    ['yes', false],
    ['', false],
  ])('reads ZERO_AUDIT_ALLOW_PRIVATE_TARGETS="%s" as allowPrivateTargets %s', (value, expected) => {
    const command = parseCommand(['serve'], { ZERO_AUDIT_ALLOW_PRIVATE_TARGETS: value });

    expect(command).toMatchObject({ kind: 'serve', allowPrivateTargets: expected });
  });

  it('reads the serve delay from ZERO_AUDIT_DELAY_MS', () => {
    expect(parseCommand(['serve'], { ZERO_AUDIT_DELAY_MS: '250' })).toMatchObject({
      kind: 'serve',
      delayMs: 250,
    });
  });

  it('rejects an invalid ZERO_AUDIT_DELAY_MS for serve', () => {
    expect(parseCommand(['serve'], { ZERO_AUDIT_DELAY_MS: 'x' }).kind).toBe('usage-error');
  });

  it('reads the serve host and port from HOST and PORT', () => {
    expect(parseCommand(['serve'], { HOST: '0.0.0.0', PORT: '8080' })).toMatchObject({
      host: '0.0.0.0',
      port: 8080,
    });
  });

  it('lets --port win over PORT', () => {
    expect(parseCommand(['serve', '--port', '9000'], { PORT: '8080' })).toMatchObject({
      port: 9000,
    });
  });

  it.each(['abc', '70000'])('rejects PORT="%s" with an explicit message', (port) => {
    const command = parseCommand(['serve'], { PORT: port });

    expect(command.kind).toBe('usage-error');
    expect(command).toMatchObject({ message: expect.stringContaining('PORT') as string });
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

describe('parseCommand mailer configuration', () => {
  const PUBLIC_URL = 'https://audit.exemple.test';
  const mailOf = (env: Record<string, string>) => {
    const command = parseCommand(['serve'], env);
    if (command.kind !== 'serve') throw new Error(`expected serve, got ${command.kind}`);
    return command.mail;
  };
  const messageOf = (env: Record<string, string>): string => {
    const command = parseCommand(['serve'], env);
    if (command.kind !== 'usage-error')
      throw new Error(`expected usage-error, got ${command.kind}`);
    return command.message;
  };

  it('uses the disabled mailer when ZERO_AUDIT_MAILER is not set', () => {
    expect(mailOf({}).kind).toBe('disabled');
  });

  it('uses the console mailer when ZERO_AUDIT_MAILER=console', () => {
    expect(mailOf({ ZERO_AUDIT_MAILER: 'console' }).kind).toBe('console');
  });

  it('reads the Brevo key, the sender and the public URL for ZERO_AUDIT_MAILER=brevo', () => {
    expect(
      mailOf({
        ZERO_AUDIT_MAILER: 'brevo',
        ZERO_AUDIT_BREVO_API_KEY: 'key',
        ZERO_AUDIT_PUBLIC_URL: PUBLIC_URL,
        ZERO_AUDIT_MAIL_FROM: 'moi@exemple.test',
      }),
    ).toEqual({ kind: 'brevo', apiKey: 'key', publicUrl: PUBLIC_URL, from: 'moi@exemple.test' });
  });

  it('defaults the sender to no-reply@agents.zero-strategie.dev', () => {
    expect(mailOf({}).from).toBe('no-reply@agents.zero-strategie.dev');
  });

  it.each([
    ['ZERO_AUDIT_BREVO_API_KEY', { ZERO_AUDIT_PUBLIC_URL: PUBLIC_URL }],
    ['ZERO_AUDIT_PUBLIC_URL', { ZERO_AUDIT_BREVO_API_KEY: 'key' }],
  ])('fails naming %s when it is missing with the brevo mailer', (name, env) => {
    expect(messageOf({ ZERO_AUDIT_MAILER: 'brevo', ...env })).toContain(name);
  });

  it('refuses an unknown ZERO_AUDIT_MAILER value', () => {
    expect(messageOf({ ZERO_AUDIT_MAILER: 'smtp' })).toContain('ZERO_AUDIT_MAILER');
  });

  it.each(['audit.exemple.test', 'ftp://audit.exemple.test', `${PUBLIC_URL}/`])(
    'refuses the public URL "%s"',
    (url) => {
      expect(messageOf({ ZERO_AUDIT_PUBLIC_URL: url })).toContain('ZERO_AUDIT_PUBLIC_URL');
    },
  );
});

describe('parseCommand administrator addresses', () => {
  const adminsOf = (env: Record<string, string>) => {
    const command = parseCommand(['serve'], env);
    if (command.kind !== 'serve') throw new Error(`expected serve, got ${command.kind}`);
    return command.adminEmails;
  };

  it('has no administrator by default', () => {
    expect(adminsOf({})).toEqual([]);
  });

  it('reads a comma-separated list, trimmed and lowercased, ignoring empty entries', () => {
    expect(
      adminsOf({ ZERO_AUDIT_ADMIN_EMAILS: ' Admin@Exemple.test, ,boss@exemple.test,' }),
    ).toEqual(['admin@exemple.test', 'boss@exemple.test']);
  });

  it('refuses an entry that is not an e-mail address, naming the variable', () => {
    const command = parseCommand(['serve'], { ZERO_AUDIT_ADMIN_EMAILS: 'admin@exemple.test,oops' });

    expect(command).toMatchObject({ kind: 'usage-error' });
    expect(JSON.stringify(command)).toContain('ZERO_AUDIT_ADMIN_EMAILS');
  });
});

describe('parseCommand serve: ZERO_AUDIT_LAUNCHES_PER_DAY', () => {
  const launchesOf = (env: Record<string, string>) => {
    const command = parseCommand(['serve'], env);
    return command.kind === 'serve' ? command.launchesPerDay : command;
  };

  it('defaults to 30 launches per day', () => {
    expect(launchesOf({})).toBe(30);
  });

  it('reads a positive integer', () => {
    expect(launchesOf({ ZERO_AUDIT_LAUNCHES_PER_DAY: '12' })).toBe(12);
  });

  it.each(['0', '-3', 'many', '2.5', ''])('refuses %j, naming the variable', (value) => {
    const command = parseCommand(['serve'], { ZERO_AUDIT_LAUNCHES_PER_DAY: value });

    expect(command).toMatchObject({ kind: 'usage-error' });
    expect(JSON.stringify(command)).toContain('ZERO_AUDIT_LAUNCHES_PER_DAY');
  });
});
