import { query, queryOne } from '../config/database';
import { CacheService, CacheTTL } from './cache.service';
import { AnalyticsMetric } from '../types/models';

const cache = new CacheService('analytics');

export interface MetricInput {
  facility_id?: string;
  asset_id?: string;
  metric_name: string;
  metric_value: number;
  tags?: Record<string, string>;
}

export interface TimeSeriesQuery {
  asset_id?: string;
  facility_id?: string;
  metric_name: string;
  from: Date;
  to: Date;
  interval?: '1min' | '5min' | '1hour' | '1day';
}

export class AnalyticsService {
  async record(metrics: MetricInput[]): Promise<void> {
    if (metrics.length === 0) return;

    // Bulk insert using unnest for efficiency
    const facilityIds = metrics.map((m) => m.facility_id ?? null);
    const assetIds = metrics.map((m) => m.asset_id ?? null);
    const names = metrics.map((m) => m.metric_name);
    const values = metrics.map((m) => m.metric_value);
    const tags = metrics.map((m) => JSON.stringify(m.tags ?? {}));

    await query(
      `INSERT INTO analytics (facility_id, asset_id, metric_name, metric_value, tags)
       SELECT * FROM UNNEST(
         $1::uuid[], $2::uuid[], $3::text[], $4::decimal[], $5::jsonb[]
       )`,
      [facilityIds, assetIds, names, values, tags]
    );
  }

  async getTimeSeries(params: TimeSeriesQuery) {
    const cacheKey = `ts:${params.asset_id}:${params.metric_name}:${params.from.getTime()}:${params.to.getTime()}:${params.interval}`;

    return cache.getOrSet(
      cacheKey,
      async () => {
        const intervalMap = {
          '1min': '1 minute',
          '5min': '5 minutes',
          '1hour': '1 hour',
          '1day': '1 day',
        };
        const pgInterval = intervalMap[params.interval ?? '5min'];

        const conditions: string[] = ['metric_name = $1', 'recorded_at BETWEEN $2 AND $3'];
        const queryParams: unknown[] = [params.metric_name, params.from, params.to];
        let idx = 4;

        if (params.asset_id) {
          conditions.push(`asset_id = $${idx++}`);
          queryParams.push(params.asset_id);
        }
        if (params.facility_id) {
          conditions.push(`facility_id = $${idx++}`);
          queryParams.push(params.facility_id);
        }

        const where = conditions.join(' AND ');

        return query<{ bucket: Date; avg: number; min: number; max: number; count: number }>(
          `SELECT
             time_bucket('${pgInterval}', recorded_at) AS bucket,
             AVG(metric_value)::decimal(20,4) AS avg,
             MIN(metric_value)::decimal(20,4) AS min,
             MAX(metric_value)::decimal(20,4) AS max,
             COUNT(*)::int AS count
           FROM analytics
           WHERE ${where}
           GROUP BY bucket
           ORDER BY bucket ASC`,
          queryParams
        );
      },
      CacheTTL.SHORT
    );
  }

  async getLatestMetrics(assetId: string): Promise<Record<string, number>> {
    const cacheKey = `latest:${assetId}`;
    return cache.getOrSet(
      cacheKey,
      async () => {
        const rows = await query<{ metric_name: string; metric_value: number }>(
          `SELECT DISTINCT ON (metric_name) metric_name, metric_value
           FROM analytics
           WHERE asset_id = $1
           ORDER BY metric_name, recorded_at DESC`,
          [assetId]
        );
        return rows.reduce(
          (acc, r) => ({ ...acc, [r.metric_name]: r.metric_value }),
          {} as Record<string, number>
        );
      },
      CacheTTL.SHORT
    );
  }

  async getDashboardSummary(facilityId: string) {
    const cacheKey = `dashboard:${facilityId}`;
    return cache.getOrSet(
      cacheKey,
      async () => {
        const [eventStats, assetStats, recentMetrics] = await Promise.all([
          query<{ hour: string; count: string }>(
            `SELECT date_trunc('hour', created_at) AS hour, COUNT(*) as count
             FROM events
             WHERE facility_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
             GROUP BY hour ORDER BY hour`,
            [facilityId]
          ),
          queryOne<{ total: string; active: string; maintenance: string }>(
            `SELECT
               COUNT(*) as total,
               COUNT(*) FILTER (WHERE status = 'active') as active,
               COUNT(*) FILTER (WHERE status = 'maintenance') as maintenance
             FROM assets WHERE facility_id = $1`,
            [facilityId]
          ),
          query<{ metric_name: string; metric_value: number; recorded_at: Date }>(
            `SELECT DISTINCT ON (metric_name) metric_name, metric_value, recorded_at
             FROM analytics WHERE facility_id = $1
             ORDER BY metric_name, recorded_at DESC`,
            [facilityId]
          ),
        ]);

        return { eventStats, assetStats, recentMetrics };
      },
      CacheTTL.SHORT
    );
  }
}

export const analyticsService = new AnalyticsService();
