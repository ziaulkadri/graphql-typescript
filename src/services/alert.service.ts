import { query, queryOne } from '../config/database';
import { CacheService, CacheTTL } from './cache.service';
import { Alert, CreateAlertInput, UpdateAlertInput, AlertStatus, PaginatedResult } from '../types/models';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { validate, createAlertSchema, paginationSchema } from '../utils/validators';

const cache = new CacheService('alert');

export class AlertService {
  async findAll(
    rawPagination: unknown,
    filters?: { status?: AlertStatus; facilityId?: string; assignedTo?: string }
  ): Promise<PaginatedResult<Alert>> {
    const { limit, offset } = validate(paginationSchema, rawPagination ?? {});

    const conditions: string[] = [];
    const params: unknown[] = [limit, offset];
    let idx = 3;

    if (filters?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.facilityId) {
      conditions.push(`facility_id = $${idx++}`);
      params.push(filters.facilityId);
    }
    if (filters?.assignedTo) {
      conditions.push(`assigned_to = $${idx++}`);
      params.push(filters.assignedTo);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [items, countResult] = await Promise.all([
      query<Alert>(
        `SELECT * FROM alerts ${where} ORDER BY
          CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          created_at DESC
         LIMIT $1 OFFSET $2`,
        params
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM alerts ${where}`,
        params.slice(2)
      ),
    ]);

    const total = parseInt(countResult?.count ?? '0', 10);
    return { items, total, limit, offset, hasMore: offset + limit < total };
  }

  async findById(id: string): Promise<Alert> {
    const alert = await queryOne<Alert>('SELECT * FROM alerts WHERE id = $1', [id]);
    if (!alert) throw new NotFoundError('Alert');
    return alert;
  }

  async create(input: unknown): Promise<Alert> {
    const data = validate(createAlertSchema, input);

    const alert = await queryOne<Alert>(
      `INSERT INTO alerts (facility_id, asset_id, event_id, title, description, severity)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.facility_id ?? null,
        data.asset_id ?? null,
        data.event_id ?? null,
        data.title,
        data.description ?? null,
        data.severity,
      ]
    );

    await cache.delPattern('list:*');
    return alert!;
  }

  async update(id: string, input: UpdateAlertInput, userId: string): Promise<Alert> {
    const existing = await this.findById(id);

    if (existing.status === 'closed') {
      throw new ForbiddenError('Cannot modify a closed alert');
    }

    const resolvedAt =
      input.status === 'resolved' || input.status === 'closed' ? 'NOW()' : 'resolved_at';

    const updated = await queryOne<Alert>(
      `UPDATE alerts SET
        status = COALESCE($2, status),
        assigned_to = COALESCE($3, assigned_to),
        description = COALESCE($4, description),
        resolved_at = ${resolvedAt}
       WHERE id = $1
       RETURNING *`,
      [id, input.status ?? null, input.assigned_to ?? null, input.description ?? null]
    );

    return updated!;
  }

  async getOpenCriticalCount(facilityId?: string): Promise<number> {
    const cacheKey = `critical:${facilityId ?? 'all'}`;
    return cache.getOrSet(
      cacheKey,
      async () => {
        const result = await queryOne<{ count: string }>(
          `SELECT COUNT(*) as count FROM alerts
           WHERE status = 'open' AND severity = 'critical'
           ${facilityId ? 'AND facility_id = $1' : ''}`,
          facilityId ? [facilityId] : []
        );
        return parseInt(result?.count ?? '0', 10);
      },
      CacheTTL.SHORT
    );
  }
}

export const alertService = new AlertService();
