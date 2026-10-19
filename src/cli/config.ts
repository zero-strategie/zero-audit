import { parseArgs } from 'node:util';

export interface AuditConfig {
  rootUrl: string;
  limit: number;
  delayMs: number;
  dbPath: string;
  jsonPath: string | null;
}

export type ParsedCommand =
  | { kind: 'help' }
  | { kind: 'usage-error'; message: string }
  | { kind: 'audit'; config: AuditConfig };

type Environment = Readonly<Record<string, string | undefined>>;

export const DEFAULT_LIMIT = 100;
export const DEFAULT_DELAY_MS = 1000;
export const DEFAULT_DB_PATH = './.zero-audit/audit.db';

const DELAY_ENV = 'ZERO_AUDIT_DELAY_MS';
const DB_ENV = 'ZERO_AUDIT_DB_PATH';
const DIGITS = /^\d+$/;

class UsageError extends Error {}

const parseInteger = (raw: string, name: string, minimum: number): number => {
  const value = DIGITS.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new UsageError(`${name} must be an integer >= ${String(minimum)} (received "${raw}")`);
  }
  return value;
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
  };
};

export const parseCommand = (argv: readonly string[], env: Environment): ParsedCommand => {
  if (argv.includes('--help')) return { kind: 'help' };
  try {
    return { kind: 'audit', config: buildConfig(argv, env) };
  } catch (error) {
    if (error instanceof Error && (error instanceof UsageError || 'code' in error)) {
      return { kind: 'usage-error', message: error.message };
    }
    throw error;
  }
};
