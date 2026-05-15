import { Pool, PoolConfig } from 'pg';
import { config } from './index';
import { logger } from '../utils/logger';

const poolConfig: PoolConfig = {
  host: config.DB_HOST,
  port: config.DB_PORT,
  database: config.DB_NAME,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  min: config.DB_POOL_MIN,
  max: config.DB_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New PostgreSQL client connected');
});

export async function checkDatabaseConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('PostgreSQL connected successfully');
  } finally {
    client.release();
  }
}

// Typed query helper that enforces return types
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (duration > 1000) {
    logger.warn('Slow query detected', { query: text, duration });
  }

  return result.rows;
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

// Transaction helper
export async function withTransaction<T>(
  callback: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
