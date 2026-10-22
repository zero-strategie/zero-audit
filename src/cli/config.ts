import { parseArgs } from 'node:util';

export const STORE_KINDS = ['sqlite', 'postgres'] as const;
export type StoreKind = (typeof STORE_KINDS)[number];

export interface StoreSelection {
  store: StoreKind;
  /** Only read when `store` is `postgres`. */
  databaseUrl: string | null;
}

/** `queue` hands the audit to a worker, `wait` also waits for its end, `direct` crawls in the process. */
export type AuditMode = 'queue' | 'wait' | 'direct';

export interface AuditConfig extends StoreSelection {
  mode: AuditMode;
  /** Tells `--wait` which worker identifiers to look for; 1 unless waiting. */
  workerConcurrency: number;
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

export interface WorkerConfig extends StoreSelection {
  dbPath: string;
  /** Audits crawled in parallel by the process. */
  concurrency: number;
  /** Disables the SSRF guard; only the exact value `true` of the environment variable does. */
  allowPrivateTargets: boolean;
  delayMs: number;
}

export interface WorkerHealthConfig extends StoreSelection {
  dbPath: string;
  /** Same value as the worker's: it tells which worker identifiers to look for. */
  concurrency: number;
}

export interface MigrateConfig extends StoreSelection {
  dbPath: string;
}

export type ParsedCommand =
  | { kind: 'help' }
  | { kind: 'usage-error'; message: string }
  | { kind: 'audit'; config: AuditConfig }
  | ({ kind: 'compare' } & CompareConfig)
  | ({ kind: 'migrate' } & MigrateConfig)
  | ({ kind: 'worker' } & WorkerConfig)
  | ({ kind: 'worker-health' } & WorkerHealthConfig);

type Environment = Readonly<Record<string, string | undefined>>;

export const DEFAULT_LIMIT = 100;
export const DEFAULT_DELAY_MS = 1000;
export const DEFAULT_WORKER_CONCURRENCY = 1;
export const DEFAULT_DB_PATH = './.zero-audit/audit.db';

const DELAY_ENV = 'ZERO_AUDIT_DELAY_MS';
const DB_ENV = 'ZERO_AUDIT_DB_PATH';
const ALLOW_PRIVATE_TARGETS_ENV = 'ZERO_AUDIT_ALLOW_PRIVATE_TARGETS';
const STORE_ENV = 'ZERO_AUDIT_STORE';
const WORKER_CONCURRENCY_ENV = 'ZERO_AUDIT_WORKER_CONCURRENCY';
const DATABASE_URL_ENV = 'DATABASE_URL';
const DIGITS = /^\d+$/;

class UsageError extends Error {}

const parseInteger = (raw: string, name: string, minimum: number): number => {
  const value = DIGITS.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new UsageError(`${name} must be an integer >= ${String(minimum)} (received "${raw}")`);
  }
  return value;
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

const parseConcurrency = (env: Environment): number =>
  parseInteger(
    env[WORKER_CONCURRENCY_ENV] ?? String(DEFAULT_WORKER_CONCURRENCY),
    WORKER_CONCURRENCY_ENV,
    1,
  );

const parseAuditMode = (flags: { wait?: boolean; direct?: boolean }): AuditMode => {
  if (flags.wait && flags.direct) throw new UsageError('--wait and --direct are exclusive');
  if (flags.direct) return 'direct';
  return flags.wait ? 'wait' : 'queue';
};

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
      wait: { type: 'boolean' },
      direct: { type: 'boolean' },
    },
  });
  if (positionals.length > 1) throw new UsageError('only one <url> is accepted');

  const delay = values.delay ?? env[DELAY_ENV];
  const mode = parseAuditMode(values);
  return {
    mode,
    workerConcurrency: mode === 'wait' ? parseConcurrency(env) : DEFAULT_WORKER_CONCURRENCY,
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

const buildMigrateConfig = (argv: readonly string[], env: Environment): MigrateConfig => {
  const { values } = parseArgs({
    args: [...argv],
    options: { db: { type: 'string' }, store: { type: 'string' } },
  });
  return { dbPath: values.db ?? env[DB_ENV] ?? DEFAULT_DB_PATH, ...parseStore(values.store, env) };
};

const buildWorkerConfig = (argv: readonly string[], env: Environment): WorkerConfig => {
  const { values } = parseArgs({
    args: [...argv],
    options: { db: { type: 'string' }, store: { type: 'string' } },
  });
  return {
    dbPath: values.db ?? env[DB_ENV] ?? DEFAULT_DB_PATH,
    concurrency: parseConcurrency(env),
    allowPrivateTargets: env[ALLOW_PRIVATE_TARGETS_ENV] === 'true',
    delayMs: parseInteger(env[DELAY_ENV] ?? String(DEFAULT_DELAY_MS), DELAY_ENV, 0),
    ...parseStore(values.store, env),
  };
};

const buildWorkerHealthConfig = (argv: readonly string[], env: Environment): WorkerHealthConfig => {
  const { values } = parseArgs({
    args: [...argv],
    options: { db: { type: 'string' }, store: { type: 'string' } },
  });
  return {
    dbPath: values.db ?? env[DB_ENV] ?? DEFAULT_DB_PATH,
    concurrency: parseConcurrency(env),
    ...parseStore(values.store, env),
  };
};

const buildCommand = (argv: readonly string[], env: Environment): ParsedCommand => {
  const [first, ...rest] = argv;
  if (first === 'worker') return { kind: 'worker', ...buildWorkerConfig(rest, env) };
  if (first === 'worker-health') {
    return { kind: 'worker-health', ...buildWorkerHealthConfig(rest, env) };
  }
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
