import DataLoader from 'dataloader';
import { facilityService } from '../../services/facility.service';
import { assetService } from '../../services/asset.service';
import { query } from '../../config/database';
import { User } from '../../types/models';
import { DataLoaders } from '../../types/context';

// Each request gets fresh DataLoader instances to prevent cross-request data leaks
export function createDataLoaders(): DataLoaders {
  return {
    facilityLoader: new DataLoader(
      async (ids: readonly string[]) => facilityService.findByIds([...ids]),
      { cache: true }
    ),

    assetLoader: new DataLoader(
      async (ids: readonly string[]) => assetService.findByIds([...ids]),
      { cache: true }
    ),

    userLoader: new DataLoader(
      async (ids: readonly string[]) => {
        const users = await query<User>(
          'SELECT id, email, name, role, is_active, last_login_at, created_at FROM users WHERE id = ANY($1)',
          [[...ids]]
        );
        const map = new Map(users.map((u) => [u.id, u]));
        return ids.map((id) => map.get(id) ?? null);
      },
      { cache: true }
    ),
  };
}
