import pg from 'pg';

export interface PoolOptions {
  /** Schema searched first; lets tests isolate themselves inside one database. */
  readonly schema?: string;
}

export const createPool = (connectionString: string, options: PoolOptions = {}): pg.Pool =>
  new pg.Pool({
    connectionString,
    ...(options.schema ? { options: `-c search_path=${options.schema}` } : {}),
  });

/** Runs `work` on a dedicated client inside a transaction; rolls back on any error. */
export const withTransaction = async <T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
