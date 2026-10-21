import { parseArgs } from 'node:util';
import { InvalidEmail } from '../domain/errors.js';
import { normalizeEmail } from '../domain/user.js';

export const STORE_KINDS = ['sqlite', 'postgres'] as const;
export type StoreKind = (typeof STORE_KINDS)[number];

export interface StoreSelection {
  store: StoreKind;
  /** Only read when `store` is `postgres`. */
  databaseUrl: string | null;
}

export interface AuditConfig extends StoreSelection {
  rootUrl: string;
  limit: number;
  delayMs: number;
  dbPath: string;
  jsonPath: string | null;
}

export interface CompareConfig extends StoreSelection {
  baseId: string;
  targetId: string;
  dbPath: string;
}

export const WORKER_MODES = ['embedded', 'external'] as const;
export type WorkerMode = (typeof WORKER_MODES)[number];

export const MAILER_KINDS = ['console', 'brevo'] as const;
export const DEFAULT_MAIL_FROM = 'no-reply@agents.zero-strategie.dev';

/** `disabled` is the default: sign-up and resets answer 503 until a mailer is chosen. */
export type MailConfig =
  | { kind: 'disabled' | 'console'; from: string; publicUrl: string | null }
  | { kind: 'brevo'; from: string; publicUrl: string; apiKey: string };

export interface ServeConfig extends StoreSelection {
  host: string;
  port: number;
  dbPath: string;
  /** Disables the SSRF guard; only the exact value `true` of the environment variable does. */
  allowPrivateTargets: boolean;
  delayMs: number;
  mail: MailConfig;
  /** Normalized with `normalizeEmail`. */
  adminEmails: string[];
  /** Ceiling of audits launched through the API per 24 hours, all accounts together. */
  launchesPerDay: number;
  /** `embedded` runs the worker loop inside `serve`; `external` leaves it to a worker process. */
  workerMode: WorkerMode;
  /** Ceiling of audits waiting in the queue, all accounts together. */
  queueMax: number;
}

export interface MigrateConfig extends StoreSelection {
  dbPath: string;
}

export type ParsedCommand =
  | { kind: 'help' }
  | { kind: 'usage-error'; message: string }
  | { kind: 'audit'; config: AuditConfig }
  | ({ kind: 'compare' } & CompareConfig)
  | ({ kind: 'serve' } & ServeConfig)
  | ({ kind: 'migrate' } & MigrateConfig);

type Environment = Readonly<Record<string, string | undefined>>;

export const DEFAULT_LIMIT = 100;
export const DEFAULT_DELAY_MS = 1000;
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 3000;
export const DEFAULT_LAUNCHES_PER_DAY = 30;
export const DEFAULT_QUEUE_MAX = 20;
export const DEFAULT_DB_PATH = './.zero-audit/audit.db';

const DELAY_ENV = 'ZERO_AUDIT_DELAY_MS';
const DB_ENV = 'ZERO_AUDIT_DB_PATH';
const ALLOW_PRIVATE_TARGETS_ENV = 'ZERO_AUDIT_ALLOW_PRIVATE_TARGETS';
const STORE_ENV = 'ZERO_AUDIT_STORE';
const MAILER_ENV = 'ZERO_AUDIT_MAILER';
const BREVO_API_KEY_ENV = 'ZERO_AUDIT_BREVO_API_KEY';
const MAIL_FROM_ENV = 'ZERO_AUDIT_MAIL_FROM';
const ADMIN_EMAILS_ENV = 'ZERO_AUDIT_ADMIN_EMAILS';
const LAUNCHES_PER_DAY_ENV = 'ZERO_AUDIT_LAUNCHES_PER_DAY';
const WORKER_ENV = 'ZERO_AUDIT_WORKER';
const QUEUE_MAX_ENV = 'ZERO_AUDIT_QUEUE_MAX';
const PUBLIC_URL_ENV = 'ZERO_AUDIT_PUBLIC_URL';
const HOST_ENV = 'HOST';
const PORT_ENV = 'PORT';
const DATABASE_URL_ENV = 'DATABASE_URL';
const MAX_PORT = 65_535;
const DIGITS = /^\d+$/;

class UsageError extends Error {}

const parseInteger = (raw: string, name: string, minimum: number): number => {
  const value = DIGITS.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new UsageError(`${name} must be an integer >= ${String(minimum)} (received "${raw}")`);
  }
  return value;
};

const parsePort = (raw: string, name: string): number => {
  const port = parseInteger(raw, name, 1);
  if (port > MAX_PORT) {
    throw new UsageError(`${name} must be an integer <= ${String(MAX_PORT)} (received "${raw}")`);
  }
  return port;
};

const isWorkerMode = (value: string): value is WorkerMode =>
  WORKER_MODES.some((mode) => mode === value);

const parseWorkerMode = (env: Environment): WorkerMode => {
  const raw = env[WORKER_ENV] ?? 'embedded';
  if (!isWorkerMode(raw)) {
    throw new UsageError(
      `${WORKER_ENV} must be one of ${WORKER_MODES.join(', ')} (received "${raw}")`,
    );
  }
  return raw;
};

const isStoreKind = (value: string): value is StoreKind =>
  STORE_KINDS.some((kind) => kind === value);

const parseStore = (option: string | undefined, env: Environment): StoreSelection => {
  const raw = option ?? env[STORE_ENV] ?? 'sqlite';
  if (!isStoreKind(raw)) {
    throw new UsageError(`--store must be one of: ${STORE_KINDS.join(', ')} (received "${raw}")`);
  }
  if (raw === 'sqlite') return { store: raw, databaseUrl: null };
  const databaseUrl = env[DATABASE_URL_ENV];
  if (!databaseUrl) throw new UsageError(`--store postgres requires ${DATABASE_URL_ENV} to be set`);
  return { store: raw, databaseUrl };
};

const parseRootUrl = (raw: string | undefined): string => {
  if (raw === undefined) throw new UsageError('missing <url> argument');
  const parsed = URL.parse(raw);
  if (parsed?.protocol !== 'http:' && parsed?.protocol !== 'https:') {
    throw new UsageError(`<url> must be an absolute http(s) URL (received "${raw}")`);
  }
  return raw;
};

const parsePublicUrl = (raw: string | undefined): string | null => {
  if (raw === undefined) return null;
  const parsed = URL.parse(raw);
  const isHttp = parsed?.protocol === 'http:' || parsed?.protocol === 'https:';
  if (!isHttp || raw.endsWith('/')) {
    throw new UsageError(
      `${PUBLIC_URL_ENV} must be an absolute http(s) URL without trailing slash (received "${raw}")`,
    );
  }
  return raw;
};

const requireEnv = (env: Environment, name: string, reason: string): string => {
  const value = env[name];
  if (!value) throw new UsageError(`${name} is required ${reason}`);
  return value;
};

const parseMail = (env: Environment): MailConfig => {
  const kind = env[MAILER_ENV];
  const from = env[MAIL_FROM_ENV] ?? DEFAULT_MAIL_FROM;
  const publicUrl = parsePublicUrl(env[PUBLIC_URL_ENV]);
  if (kind === undefined) return { kind: 'disabled', from, publicUrl };
  if (kind === 'console') return { kind, from, publicUrl };
  if (kind !== 'brevo') {
    throw new UsageError(
      `${MAILER_ENV} must be one of: ${MAILER_KINDS.join(', ')} (received "${kind}")`,
    );
  }
  const reason = `when ${MAILER_ENV}=brevo`;
  const apiKey = requireEnv(env, BREVO_API_KEY_ENV, reason);
  if (publicUrl === null) throw new UsageError(`${PUBLIC_URL_ENV} is required ${reason}`);
  return { kind, from, publicUrl, apiKey };
};

const parseAdminEmails = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .filter((entry) => entry.trim() !== '')
    .map((entry) => {
      try {
        return normalizeEmail(entry);
      } catch (error) {
        if (!(error instanceof InvalidEmail)) throw error;
        throw new UsageError(
          `${ADMIN_EMAILS_ENV} must list e-mail addresses (received "${entry}")`,
        );
      }
    });

const buildConfig = (argv: readonly string[], env: Environment): AuditConfig => {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      limit: { type: 'string' },
      delay: { type: 'string' },
      db: { type: 'string' },
      json: { type: 'string' },
      store: { type: 'string' },
    },
  });
  if (positionals.length > 1) throw new UsageError('only one <url> is accepted');

  const delay = values.delay ?? env[DELAY_ENV];
  return {
    rootUrl: parseRootUrl(positionals[0]),
    limit: values.limit === undefined ? DEFAULT_LIMIT : parseInteger(values.limit, '--limit', 1),
    delayMs: delay === undefined ? DEFAULT_DELAY_MS : parseInteger(delay, '--delay', 0),
    dbPath: values.db ?? env[DB_ENV] ?? DEFAULT_DB_PATH,
    jsonPath: values.json ?? null,
    ...parseStore(values.store, env),
  };
};

const buildCompareConfig = (argv: readonly string[], env: Environment): CompareConfig => {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: { db: { type: 'string' }, store: { type: 'string' } },
  });
  const [baseId, targetId, ...extra] = positionals;
  if (baseId === undefined || targetId === undefined || extra.length > 0) {
    throw new UsageError('compare expects exactly two snapshot ids: compare <A> <B>');
  }
  return {
    baseId,
    targetId,
    dbPath: values.db ?? env[DB_ENV] ?? DEFAULT_DB_PATH,
    ...parseStore(values.store, env),
  };
};

const buildServeConfig = (argv: readonly string[], env: Environment): ServeConfig => {
  const { values } = parseArgs({
    args: [...argv],
    options: { port: { type: 'string' }, db: { type: 'string' }, store: { type: 'string' } },
  });
  const port =
    values.port !== undefined
      ? parsePort(values.port, '--port')
      : parsePort(env[PORT_ENV] ?? String(DEFAULT_PORT), PORT_ENV);
  return {
    host: env[HOST_ENV] ?? DEFAULT_HOST,
    port,
    dbPath: values.db ?? env[DB_ENV] ?? DEFAULT_DB_PATH,
    allowPrivateTargets: env[ALLOW_PRIVATE_TARGETS_ENV] === 'true',
    delayMs: parseInteger(env[DELAY_ENV] ?? String(DEFAULT_DELAY_MS), DELAY_ENV, 0),
    mail: parseMail(env),
    adminEmails: parseAdminEmails(env[ADMIN_EMAILS_ENV]),
    launchesPerDay: parseInteger(
      env[LAUNCHES_PER_DAY_ENV] ?? String(DEFAULT_LAUNCHES_PER_DAY),
      LAUNCHES_PER_DAY_ENV,
      1,
    ),
    workerMode: parseWorkerMode(env),
    queueMax: parseInteger(env[QUEUE_MAX_ENV] ?? String(DEFAULT_QUEUE_MAX), QUEUE_MAX_ENV, 1),
    ...parseStore(values.store, env),
  };
};

const buildMigrateConfig = (argv: readonly string[], env: Environment): MigrateConfig => {
  const { values } = parseArgs({
    args: [...argv],
    options: { db: { type: 'string' }, store: { type: 'string' } },
  });
  return { dbPath: values.db ?? env[DB_ENV] ?? DEFAULT_DB_PATH, ...parseStore(values.store, env) };
};

const buildCommand = (argv: readonly string[], env: Environment): ParsedCommand => {
  const [first, ...rest] = argv;
  if (first === 'serve') return { kind: 'serve', ...buildServeConfig(rest, env) };
  if (first === 'migrate') return { kind: 'migrate', ...buildMigrateConfig(rest, env) };
  if (first === 'compare') return { kind: 'compare', ...buildCompareConfig(rest, env) };
  return { kind: 'audit', config: buildConfig(first === 'audit' ? rest : argv, env) };
};

export const parseCommand = (argv: readonly string[], env: Environment): ParsedCommand => {
  if (argv.includes('--help')) return { kind: 'help' };
  try {
    return buildCommand(argv, env);
  } catch (error) {
    if (error instanceof Error && (error instanceof UsageError || 'code' in error)) {
      return { kind: 'usage-error', message: error.message };
    }
    throw error;
  }
};
