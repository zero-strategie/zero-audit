import type { AuditQueue } from '../application/ports/audit-queue.js';
import type { AccountEraser } from '../application/ports/account-eraser.js';
import type { EmailTokenRepository } from '../application/ports/email-token-repository.js';
import type { SessionRepository } from '../application/ports/session-repository.js';
import type { UserRepository } from '../application/ports/user-repository.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { StorageHealth } from '../application/ports/storage-health.js';
import type { SnapshotRepository } from '../application/ports/snapshot-repository.js';
import { MigrateStorage } from '../application/migrate-storage.js';
import { migrate } from '../infrastructure/postgres/migrate.js';
import { createPool } from '../infrastructure/postgres/pool.js';
import { PostgresSnapshotRepository } from '../infrastructure/postgres/postgres-snapshot-repository.js';
import { PostgresStorageMigrator } from '../infrastructure/postgres/postgres-storage-migrator.js';
import { SqliteStorageMigrator } from '../infrastructure/sqlite/sqlite-storage-migrator.js';
import { SqliteSnapshotRepository } from '../infrastructure/sqlite/sqlite-snapshot-repository.js';
import type { StoreSelection } from './config.js';

export interface Storage {
  readonly projects: ProjectRepository;
  readonly snapshots: SnapshotRepository;
  readonly queue: AuditQueue;
  readonly health: StorageHealth;
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly emailTokens: EmailTokenRepository;
  readonly eraser: AccountEraser;
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
    queue: repository,
    health: repository,
    users: repository.users,
    sessions: repository.sessions,
    emailTokens: repository.emailTokens,
    eraser: repository.eraser,
    close: once(() => {
      repository.close();
      return Promise.resolve();
    }),
  };
};

const connectionFailure = (error: unknown, databaseUrl: string): Error => {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(
    `Connexion à ${redactDatabaseUrl(databaseUrl)} impossible : ${withoutPasswords(reason, databaseUrl)}`,
    { cause: error },
  );
};

const openPostgres = async (databaseUrl: string): Promise<Storage> => {
  const pool = createPool(databaseUrl);
  try {
    await migrate(pool);
  } catch (error) {
    await pool.end();
    throw connectionFailure(error, databaseUrl);
  }
  const repository = new PostgresSnapshotRepository(pool);
  return {
    projects: repository.projects,
    snapshots: repository,
    queue: repository,
    health: repository,
    users: repository.users,
    sessions: repository.sessions,
    emailTokens: repository.emailTokens,
    eraser: repository.eraser,
    close: once(() => pool.end()),
  };
};

export const createStorage: StorageFactory = (config) =>
  config.store === 'postgres' && config.databaseUrl !== null
    ? openPostgres(config.databaseUrl)
    : Promise.resolve(openSqlite(config.dbPath));

/** Applies the pending migrations of the selected storage, then releases every connection. */
export const migrateStorage = async (config: StorageConfig): Promise<void> => {
  if (config.store !== 'postgres' || config.databaseUrl === null) {
    await new MigrateStorage(new SqliteStorageMigrator(config.dbPath)).execute();
    return;
  }
  const pool = createPool(config.databaseUrl);
  try {
    await new MigrateStorage(new PostgresStorageMigrator(pool)).execute();
  } catch (error) {
    throw connectionFailure(error, config.databaseUrl);
  } finally {
    await pool.end();
  }
};
