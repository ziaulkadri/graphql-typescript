import { query, queryOne } from '../config/database';
import { CacheService, CacheTTL, publish } from './cache.service';
import { SupplyChainEvent, CreateEventInput, PaginatedResult, EventSeverity } from '../types/models';
import { NotFoundError } from '../utils/errors';
import { validate, createEventSchema, paginationSchema } from '../utils/validators';
import { assetService } from './asset.service';

const cache = new CacheService('event');

export const EVENT_CHANNELS = {
  NEW_EVENT: 'koi:events:new',
  CRITICAL_EVENT: 'koi:events:critical',
};

export class EventService {
  async findAll(
    rawPagination: unknown,
    filters?: { facilityId?: string; assetId?: string; severity?: EventSeverity; processed?: boolean }
  ): Promise<PaginatedResult<SupplyChainEvent>> {
    const { limit, offset } = validate(paginationSchema, rawPagination ?? {});

    const conditions: string[] = [];
    const params: unknown[] = [limit, offset];
    let paramIndex = 3;

    if (filters?.facilityId) {
      conditions.push(`facility_id = $${paramIndex++}`);
      params.push(filters.facilityId);
    }
    if (filters?.assetId) {
      conditions.push(`asset_id = $${paramIndex++}`);
      params.push(filters.assetId);
    }
    if (filters?.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      params.push(filters.severity);
    }
    if (filters?.processed !== undefined) {
      conditions.push(`processed = $${paramIndex++}`);
      params.push(filters.processed);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [items, countResult] = await Promise.all([
      query<SupplyChainEvent>(
        `SELECT * FROM events ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        params
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM events ${where}`,
        params.slice(2)
      ),
    ]);

    const total = parseInt(countResult?.count ?? '0', 10);
    return { items, total, limit, offset, hasMore: offset + limit < total };
  }

  async findById(id: string): Promise<SupplyChainEvent> {
    const event = await queryOne<SupplyChainEvent>('SELECT * FROM events WHERE id = $1', [id]);
    if (!event) throw new NotFoundError('Event');
    return event;
  }

  async ingest(input: unknown): Promise<SupplyChainEvent> {
    const data = validate(createEventSchema, input);

    const event = await queryOne<SupplyChainEvent>(
      `INSERT INTO events (asset_id, facility_id, type, severity, data, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.asset_id, data.facility_id, data.type, data.severity, JSON.stringify(data.data), data.source]
    );

    // Update asset last_seen timestamp
    await assetService.updateLastSeen(data.asset_id);

    // Publish to Redis for real-time subscriptions
    await publish(EVENT_CHANNELS.NEW_EVENT, event);
    if (event!.severity === 'critical') {
      await publish(EVENT_CHANNELS.CRITICAL_EVENT, event);
    }

    return event!;
  }

  async markProcessed(id: string): Promise<SupplyChainEvent> {
    const event = await queryOne<SupplyChainEvent>(
      `UPDATE events SET processed = TRUE, processed_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!event) throw new NotFoundError('Event');
    return event;
  }

  async getUnprocessedCount(facilityId?: string): Promise<number> {
    const cacheKey = `unprocessed:${facilityId ?? 'all'}`;
    return cache.getOrSet(
      cacheKey,
      async () => {
        const result = await queryOne<{ count: string }>(
          `SELECT COUNT(*) as count FROM events
           WHERE processed = FALSE ${facilityId ? 'AND facility_id = $1' : ''}`,
          facilityId ? [facilityId] : []
        );
        return parseInt(result?.count ?? '0', 10);
      },
      CacheTTL.SHORT
    );
  }

  async getEventStats(facilityId: string) {
    const cacheKey = `stats:${facilityId}`;
    return cache.getOrSet(
      cacheKey,
      async () => {
        const rows = await query<{ severity: string; count: string }>(
          `SELECT severity, COUNT(*) as count
           FROM events
           WHERE facility_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
           GROUP BY severity`,
          [facilityId]
        );
        return rows.reduce(
          (acc, r) => ({ ...acc, [r.severity]: parseInt(r.count, 10) }),
          {} as Record<string, number>
        );
      },
      CacheTTL.SHORT
    );
  }
}

export const eventService = new EventService();
