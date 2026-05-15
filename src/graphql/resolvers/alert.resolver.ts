import { alertService } from '../../services/alert.service';
import { GraphQLContext } from '../../types/context';
import { Alert, UpdateAlertInput } from '../../types/models';
import { requireAuth, requireRole } from '../helpers';
import { pubsub } from '../pubsub';

export const alertResolvers = {
  Query: {
    alerts: async (
      _: unknown,
      { pagination, filters }: { pagination?: unknown; filters?: unknown },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      const result = await alertService.findAll(pagination ?? {}, filters as never);
      return {
        items: result.items,
        pageInfo: { total: result.total, limit: result.limit, offset: result.offset, hasMore: result.hasMore },
      };
    },

    alert: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return alertService.findById(id);
    },

    openCriticalAlertCount: async (
      _: unknown,
      { facilityId }: { facilityId?: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      return alertService.getOpenCriticalCount(facilityId);
    },
  },

  Mutation: {
    createAlert: async (_: unknown, { input }: { input: unknown }, ctx: GraphQLContext) => {
      requireRole(ctx, 'admin', 'operator');
      const alert = await alertService.create(input);
      pubsub.publish('ALERT_CREATED', { alertCreated: alert });
      return alert;
    },

    updateAlert: async (
      _: unknown,
      { id, input }: { id: string; input: UpdateAlertInput },
      ctx: GraphQLContext
    ) => {
      requireRole(ctx, 'admin', 'operator');
      return alertService.update(id, input, ctx.user!.id);
    },
  },

  Subscription: {
    alertCreated: {
      subscribe: (_: unknown, { facilityId }: { facilityId?: string }) =>
        pubsub.asyncIterator(['ALERT_CREATED']),
      resolve: (payload: { alertCreated: Alert }, args: { facilityId?: string }) => {
        if (args.facilityId && payload.alertCreated.facility_id !== args.facilityId) return null;
        return payload.alertCreated;
      },
    },
  },

  Alert: {
    facilityId: (parent: Alert) => parent.facility_id,
    assetId: (parent: Alert) => parent.asset_id,
    eventId: (parent: Alert) => parent.event_id,
    assignedTo: (parent: Alert) => parent.assigned_to,
    resolvedAt: (parent: Alert) => parent.resolved_at,
    createdAt: (parent: Alert) => parent.created_at,
    updatedAt: (parent: Alert) => parent.updated_at,

    facility: async (parent: Alert, _: unknown, ctx: GraphQLContext) => {
      if (!parent.facility_id) return null;
      return ctx.loaders.facilityLoader.load(parent.facility_id);
    },

    asset: async (parent: Alert, _: unknown, ctx: GraphQLContext) => {
      if (!parent.asset_id) return null;
      return ctx.loaders.assetLoader.load(parent.asset_id);
    },

    assignedUser: async (parent: Alert, _: unknown, ctx: GraphQLContext) => {
      if (!parent.assigned_to) return null;
      return ctx.loaders.userLoader.load(parent.assigned_to);
    },
  },
};
