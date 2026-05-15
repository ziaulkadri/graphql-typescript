import { assetService } from '../../services/asset.service';
import { analyticsService } from '../../services/analytics.service';
import { GraphQLContext } from '../../types/context';
import { Asset, UpdateAssetInput } from '../../types/models';
import { requireAuth, requireRole } from '../helpers';

export const assetResolvers = {
  Query: {
    assets: async (
      _: unknown,
      { pagination, filters }: { pagination?: unknown; filters?: unknown },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      const result = await assetService.findAll(pagination ?? {}, filters as never);
      return {
        items: result.items,
        pageInfo: { total: result.total, limit: result.limit, offset: result.offset, hasMore: result.hasMore },
      };
    },

    asset: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return assetService.findById(id);
    },
  },

  Mutation: {
    createAsset: async (_: unknown, { input }: { input: unknown }, ctx: GraphQLContext) => {
      requireRole(ctx, 'admin', 'operator');
      return assetService.create(input);
    },

    updateAsset: async (
      _: unknown,
      { id, input }: { id: string; input: UpdateAssetInput },
      ctx: GraphQLContext
    ) => {
      requireRole(ctx, 'admin', 'operator');
      return assetService.update(id, input);
    },
  },

  Asset: {
    facilityId: (parent: Asset) => parent.facility_id,
    serialNumber: (parent: Asset) => parent.serial_number,
    lastSeenAt: (parent: Asset) => parent.last_seen_at,
    createdAt: (parent: Asset) => parent.created_at,
    updatedAt: (parent: Asset) => parent.updated_at,

    // DataLoader prevents N+1
    facility: async (parent: Asset, _: unknown, ctx: GraphQLContext) => {
      return ctx.loaders.facilityLoader.load(parent.facility_id);
    },

    latestMetrics: async (parent: Asset) => {
      return analyticsService.getLatestMetrics(parent.id);
    },
  },
};
