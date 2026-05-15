import fs from 'fs';
import path from 'path';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     VARCHAR(255) PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace('.sql', '');
      const { rowCount } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [version]
      );

      if (rowCount && rowCount > 0) {
        logger.info(`Skipping migration: ${version} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      logger.info(`Applied migration: ${version}`);
    }

    logger.info('All migrations completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration failed', { error: (err as Error).message });
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  logger.error('Fatal migration error', { error: err.message });
  process.exit(1);
});
