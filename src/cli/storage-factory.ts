import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { SnapshotRepository } from '../application/ports/snapshot-repository.js';
import { migrate } from '../infrastructure/postgres/migrate.js';
import { createPool } from '../infrastructure/postgres/pool.js';
import { PostgresSnapshotRepository } from '../infrastructure/postgres/postgres-snapshot-repository.js';
import { SqliteSnapshotRepository } from '../infrastructure/sqlite/sqlite-snapshot-repository.js';
import type { StoreSelection } from './config.js';

export interface Storage {
  readonly projects: ProjectRepository;
  readonly snapshots: SnapshotRepository;
  /** Idempotent: releasing the connection twice (end of command and SIGINT) is harmless. */
  close(): Promise<void>;
}

export type StorageConfig = StoreSelection & { dbPath: string };
export type StorageFactory = (config: StorageConfig) => Promise<Storage>;

const REDACTED_PASSWORD = '***';
const INVALID_URL = '<invalid URL>';

export const redactDatabaseUrl = (url: string): string => {
  const parsed = URL.parse(url);
  if (parsed === null) return INVALID_URL;
  if (parsed.password !== '') parsed.password = REDACTED_PASSWORD;
  return parsed.toString();
};

const passwordsOf = (url: string): string[] => {
  const password = URL.parse(url)?.password ?? '';
  if (password === '') return [];
  return [password, decodeURIComponent(password)];
};

const withoutPasswords = (text: string, url: string): string =>
  passwordsOf(url).reduce((safe, password) => safe.replaceAll(password, REDACTED_PASSWORD), text);

const once = (action: () => Promise<void>): (() => Promise<void>) => {
  let closing: Promise<void> | null = null;
  return () => (closing ??= action());
};

const openSqlite = (dbPath: string): Storage => {
  const repository = SqliteSnapshotRepository.open(dbPath);
  return {
    projects: repository.projects,
    snapshots: repository,
    close: once(() => {
      repository.close();
      return Promise.resolve();
    }),
  };
};

const openPostgres = async (databaseUrl: string): Promise<Storage> => {
  const pool = createPool(databaseUrl);
  try {
    await migrate(pool);
  } catch (error) {
    await pool.end();
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Connexion à ${redactDatabaseUrl(databaseUrl)} impossible : ${withoutPasswords(reason, databaseUrl)}`,
    );
  }
  const repository = new PostgresSnapshotRepository(pool);
  return {
    projects: repository.projects,
    snapshots: repository,
    close: once(() => pool.end()),
  };
};

export const createStorage: StorageFactory = (config) =>
  config.store === 'postgres' && config.databaseUrl !== null
    ? openPostgres(config.databaseUrl)
    : Promise.resolve(openSqlite(config.dbPath));
