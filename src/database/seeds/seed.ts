import bcrypt from 'bcryptjs';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Admin user
    const passwordHash = await bcrypt.hash('Admin@1234', 12);
    const { rows: [admin] } = await client.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      ['admin@koireader.com', passwordHash, 'System Admin', 'admin']
    );

    // Facilities
    const { rows: facilities } = await client.query(
      `INSERT INTO facilities (name, location, type, metadata) VALUES
        ('Chennai Warehouse A', 'Chennai, Tamil Nadu', 'warehouse', '{"capacity": 50000, "units": "sqft"}'),
        ('Pune Manufacturing Plant', 'Pune, Maharashtra', 'manufacturing', '{"production_capacity": 1000, "units": "units/day"}'),
        ('Mumbai Port Terminal', 'JNPT, Mumbai', 'port', '{"berths": 12, "annual_throughput": "5M TEU"}')
       ON CONFLICT DO NOTHING
       RETURNING id, name`
    );

    if (facilities.length === 0) {
      logger.info('Seed data already exists, skipping');
      await client.query('ROLLBACK');
      return;
    }

    // Assets per facility
    const assetInserts = facilities.flatMap((f, i) => [
      [f.id, `Conveyor Belt ${i + 1}`, 'conveyor', `SN-CB-00${i + 1}`],
      [f.id, `Forklift ${i + 1}`, 'forklift', `SN-FL-00${i + 1}`],
      [f.id, `CCTV Camera ${i + 1}`, 'camera', `SN-CAM-00${i + 1}`],
    ]);

    const assetIds: string[] = [];
    for (const [fid, name, type, sn] of assetInserts) {
      const { rows: [a] } = await client.query(
        `INSERT INTO assets (facility_id, name, type, serial_number)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [fid, name, type, sn]
      );
      assetIds.push(a.id as string);
    }

    // Sample events
    const severities = ['info', 'warning', 'critical'] as const;
    for (let i = 0; i < 10; i++) {
      const assetId = assetIds[i % assetIds.length];
      const facilityId = facilities[i % facilities.length].id as string;
      await client.query(
        `INSERT INTO events (asset_id, facility_id, type, severity, data, source)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          assetId,
          facilityId,
          i % 2 === 0 ? 'anomaly_detected' : 'threshold_breach',
          severities[i % 3],
          JSON.stringify({ confidence: 0.9 + (i * 0.005), frame_id: 1000 + i }),
          'koi-vision-v2',
        ]
      );
    }

    // Sample alerts
    await client.query(
      `INSERT INTO alerts (facility_id, asset_id, title, severity, status, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [facilities[0].id, assetIds[0], 'Conveyor belt speed anomaly detected', 'high', 'open', admin.id]
    );

    await client.query('COMMIT');
    logger.info('Seed completed successfully');
    logger.info(`Admin credentials: admin@koireader.com / Admin@1234`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Seed failed', { error: (err as Error).message });
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  logger.error('Fatal seed error', { error: err.message });
  process.exit(1);
});
