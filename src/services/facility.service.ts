import { query, queryOne, withTransaction } from '../config/database';
import { CacheService, CacheTTL } from './cache.service';
import { Facility, CreateFacilityInput, UpdateFacilityInput, PaginatedResult } from '../types/models';
import { NotFoundError } from '../utils/errors';
import { validate, createFacilitySchema, paginationSchema } from '../utils/validators';

const cache = new CacheService('facility');

export class FacilityService {
  async findAll(rawPagination: unknown): Promise<PaginatedResult<Facility>> {
    const { limit, offset } = validate(paginationSchema, rawPagination ?? {});
    const cacheKey = `list:${limit}:${offset}`;

    return cache.getOrSet(
      cacheKey,
      async () => {
        const [items, countResult] = await Promise.all([
          query<Facility>(
            `SELECT id, name, location, type, metadata, is_active, created_at, updated_at
             FROM facilities
             WHERE is_active = TRUE
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
          ),
          queryOne<{ count: string }>(
            'SELECT COUNT(*) as count FROM facilities WHERE is_active = TRUE'
          ),
        ]);

        const total = parseInt(countResult?.count ?? '0', 10);
        return { items, total, limit, offset, hasMore: offset + limit < total };
      },
      CacheTTL.MEDIUM
    );
  }

  async findById(id: string): Promise<Facility> {
    return cache.getOrSet(
      id,
      async () => {
        const facility = await queryOne<Facility>(
          'SELECT * FROM facilities WHERE id = $1 AND is_active = TRUE',
          [id]
        );
        if (!facility) throw new NotFoundError('Facility');
        return facility;
      },
      CacheTTL.MEDIUM
    );
  }

  async findByIds(ids: string[]): Promise<(Facility | null)[]> {
    if (ids.length === 0) return [];

    const facilities = await query<Facility>(
      'SELECT * FROM facilities WHERE id = ANY($1) AND is_active = TRUE',
      [ids]
    );

    const map = new Map(facilities.map((f) => [f.id, f]));
    return ids.map((id) => map.get(id) ?? null);
  }

  async create(input: unknown): Promise<Facility> {
    const data = validate(createFacilitySchema, input);

    const facility = await queryOne<Facility>(
      `INSERT INTO facilities (name, location, type, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.name, data.location, data.type, JSON.stringify(data.metadata)]
    );

    await cache.delPattern('list:*');
    return facility!;
  }

  async update(id: string, input: UpdateFacilityInput): Promise<Facility> {
    const existing = await this.findById(id);

    const updated = await queryOne<Facility>(
      `UPDATE facilities SET
        name = COALESCE($2, name),
        location = COALESCE($3, location),
        type = COALESCE($4, type),
        metadata = COALESCE($5, metadata),
        is_active = COALESCE($6, is_active)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.name ?? null,
        input.location ?? null,
        input.type ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.is_active ?? null,
      ]
    );

    await Promise.all([cache.del(id), cache.delPattern('list:*')]);
    return updated!;
  }

  async delete(id: string): Promise<boolean> {
    await this.findById(id);
    await query('UPDATE facilities SET is_active = FALSE WHERE id = $1', [id]);
    await Promise.all([cache.del(id), cache.delPattern('list:*')]);
    return true;
  }
}

export const facilityService = new FacilityService();
