import { facilityService } from '../../services/facility.service';
import { assetService } from '../../services/asset.service';
import { alertService } from '../../services/alert.service';
import { GraphQLContext } from '../../types/context';
import { Facility, UpdateFacilityInput } from '../../types/models';
import { requireAuth, requireRole } from '../helpers';

export const facilityResolvers = {
  Query: {
    facilities: async (_: unknown, { pagination }: { pagination?: unknown }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      const result = await facilityService.findAll(pagination ?? {});
      return {
        items: result.items,
        pageInfo: { total: result.total, limit: result.limit, offset: result.offset, hasMore: result.hasMore },
      };
    },

    facility: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return facilityService.findById(id);
    },
  },

  Mutation: {
    createFacility: async (_: unknown, { input }: { input: unknown }, ctx: GraphQLContext) => {
      requireRole(ctx, 'admin', 'operator');
      return facilityService.create(input);
    },

    updateFacility: async (
      _: unknown,
      { id, input }: { id: string; input: UpdateFacilityInput },
      ctx: GraphQLContext
    ) => {
      requireRole(ctx, 'admin', 'operator');
      return facilityService.update(id, input);
    },

    deleteFacility: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireRole(ctx, 'admin');
      return facilityService.delete(id);
    },
  },

  Facility: {
    isActive: (parent: Facility) => parent.is_active,
    createdAt: (parent: Facility) => parent.created_at,
    updatedAt: (parent: Facility) => parent.updated_at,

    assets: async (
      parent: Facility,
      { pagination }: { pagination?: unknown }
    ) => {
      const result = await assetService.findAll(pagination ?? {}, { facilityId: parent.id });
      return {
        items: result.items,
        pageInfo: { total: result.total, limit: result.limit, offset: result.offset, hasMore: result.hasMore },
      };
    },

    openAlerts: async (parent: Facility) => {
      return alertService.getOpenCriticalCount(parent.id);
    },
  },
};
