import type pg from 'pg';
import type { AccountEraser } from '../../application/ports/account-eraser.js';
import { withTransaction } from './pool.js';

const OWNED_SNAPSHOTS =
  'SELECT s.id FROM snapshots s JOIN projects p ON p.id = s.project_id WHERE p.owner_id = $1';

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

export class PostgresAccountEraser implements AccountEraser {
  constructor(private readonly pool: pg.Pool) {}

  eraseAccount(userId: string): Promise<void> {
    return withTransaction(this.pool, (client) => this.eraseOne(client, userId));
  }

  purgeUnverifiedBefore(date: Date): Promise<number> {
    return withTransaction(this.pool, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM users WHERE verified_at IS NULL AND created_at < $1',
        [date],
      );
      for (const { id } of rows) await this.eraseOne(client, id);
      return rows.length;
    });
  }

  private async eraseOne(client: pg.PoolClient, userId: string): Promise<void> {
    for (const table of SNAPSHOT_CHILD_TABLES) {
      await client.query(`DELETE FROM ${table} WHERE snapshot_id IN (${OWNED_SNAPSHOTS})`, [
        userId,
      ]);
    }
    await client.query(`DELETE FROM snapshots WHERE id IN (${OWNED_SNAPSHOTS})`, [userId]);
    // A launch outside the account's own projects keeps its data but must not point at the account.
    await client.query('UPDATE snapshots SET launched_by = NULL WHERE launched_by = $1', [userId]);
    await client.query('DELETE FROM projects WHERE owner_id = $1', [userId]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM email_tokens WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
  }
}
