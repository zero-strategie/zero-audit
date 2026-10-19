import { parseArgs } from 'node:util';

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

export type ParsedCommand =
  | { kind: 'help' }
  | { kind: 'usage-error'; message: string }
  | { kind: 'audit'; config: AuditConfig }
  | ({ kind: 'compare' } & CompareConfig)
  | { kind: 'serve' };

type Environment = Readonly<Record<string, string | undefined>>;

export const DEFAULT_LIMIT = 100;
export const DEFAULT_DELAY_MS = 1000;
export const DEFAULT_DB_PATH = './.zero-audit/audit.db';

const DELAY_ENV = 'ZERO_AUDIT_DELAY_MS';
const DB_ENV = 'ZERO_AUDIT_DB_PATH';
const STORE_ENV = 'ZERO_AUDIT_STORE';
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

const buildCommand = (argv: readonly string[], env: Environment): ParsedCommand => {
  const [first, ...rest] = argv;
  if (first === 'serve') return { kind: 'serve' };
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
