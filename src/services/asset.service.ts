import { query, queryOne } from '../config/database';
import { CacheService, CacheTTL } from './cache.service';
import { Asset, CreateAssetInput, UpdateAssetInput, PaginatedResult, AssetStatus } from '../types/models';
import { NotFoundError } from '../utils/errors';
import { validate, createAssetSchema, paginationSchema } from '../utils/validators';

const cache = new CacheService('asset');

export class AssetService {
  async findAll(
    rawPagination: unknown,
    filters?: { facilityId?: string; status?: AssetStatus; type?: string }
  ): Promise<PaginatedResult<Asset>> {
    const { limit, offset } = validate(paginationSchema, rawPagination ?? {});

    const conditions: string[] = [];
    const params: unknown[] = [limit, offset];
    let paramIndex = 3;

    if (filters?.facilityId) {
      conditions.push(`facility_id = $${paramIndex++}`);
      params.push(filters.facilityId);
    }
    if (filters?.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }
    if (filters?.type) {
      conditions.push(`type ILIKE $${paramIndex++}`);
      params.push(`%${filters.type}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [items, countResult] = await Promise.all([
      query<Asset>(
        `SELECT * FROM assets ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        params
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM assets ${where}`,
        params.slice(2)
      ),
    ]);

    const total = parseInt(countResult?.count ?? '0', 10);
    return { items, total, limit, offset, hasMore: offset + limit < total };
  }

  async findById(id: string): Promise<Asset> {
    return cache.getOrSet(
      id,
      async () => {
        const asset = await queryOne<Asset>('SELECT * FROM assets WHERE id = $1', [id]);
        if (!asset) throw new NotFoundError('Asset');
        return asset;
      },
      CacheTTL.MEDIUM
    );
  }

  async findByIds(ids: string[]): Promise<(Asset | null)[]> {
    if (ids.length === 0) return [];
    const assets = await query<Asset>('SELECT * FROM assets WHERE id = ANY($1)', [ids]);
    const map = new Map(assets.map((a) => [a.id, a]));
    return ids.map((id) => map.get(id) ?? null);
  }

  async create(input: unknown): Promise<Asset> {
    const data = validate(createAssetSchema, input);

    const asset = await queryOne<Asset>(
      `INSERT INTO assets (facility_id, name, type, serial_number, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.facility_id, data.name, data.type, data.serial_number ?? null, JSON.stringify(data.metadata)]
    );

    await cache.delPattern(`list:*`);
    return asset!;
  }

  async update(id: string, input: UpdateAssetInput): Promise<Asset> {
    await this.findById(id);

    const updated = await queryOne<Asset>(
      `UPDATE assets SET
        name = COALESCE($2, name),
        type = COALESCE($3, type),
        status = COALESCE($4, status),
        metadata = COALESCE($5, metadata),
        last_seen_at = CASE WHEN $4::text = 'active' THEN NOW() ELSE last_seen_at END
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.name ?? null,
        input.type ?? null,
        input.status ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );

    await cache.del(id);
    return updated!;
  }

  async updateLastSeen(id: string): Promise<void> {
    await query('UPDATE assets SET last_seen_at = NOW() WHERE id = $1', [id]);
    await cache.del(id);
  }
}

export const assetService = new AssetService();
