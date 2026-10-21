import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { AccountEraser } from '../../application/ports/account-eraser.js';

const OWNED_SNAPSHOTS =
  'SELECT s.id FROM snapshots s JOIN projects p ON p.id = s.project_id WHERE p.owner_id = ?';

/** Children first: foreign keys are enforced and nothing cascades. */
const SNAPSHOT_CHILD_TABLES = [
  'issue_occurrences',
  'check_results',
  'slash_probes',
  'host_probes',
  'site_files',
  'links',
  'pages',
];

export class SqliteAccountEraser implements AccountEraser {
  constructor(private readonly db: SqliteDatabase) {}

  eraseAccount(userId: string): Promise<void> {
    try {
      this.db.transaction(() => {
        this.eraseOne(userId);
      })();
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  purgeUnverifiedBefore(date: Date): Promise<number> {
    try {
      return Promise.resolve(
        this.db.transaction(() => {
          const doomed = this.db
            .prepare('SELECT id FROM users WHERE verified_at IS NULL AND created_at < ?')
            .all(date.toISOString()) as { id: string }[];
          for (const { id } of doomed) this.eraseOne(id);
          return doomed.length;
        })(),
      );
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  purgeLaunchesBefore(date: Date): Promise<number> {
    try {
      const { changes } = this.db
        .prepare('DELETE FROM api_launches WHERE launched_at < ?')
        .run(date.toISOString());
      return Promise.resolve(changes);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private eraseOne(userId: string): void {
    for (const table of SNAPSHOT_CHILD_TABLES) {
      this.db.prepare(`DELETE FROM ${table} WHERE snapshot_id IN (${OWNED_SNAPSHOTS})`).run(userId);
    }
    this.db.prepare(`DELETE FROM snapshots WHERE id IN (${OWNED_SNAPSHOTS})`).run(userId);
    // A launch outside the account's own projects keeps its data but must not point at the account.
    this.db.prepare('UPDATE snapshots SET launched_by = NULL WHERE launched_by = ?').run(userId);
    this.db.prepare('DELETE FROM projects WHERE owner_id = ?').run(userId);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM email_tokens WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }
}
