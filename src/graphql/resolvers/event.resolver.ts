import { eventService, EVENT_CHANNELS } from '../../services/event.service';
import { GraphQLContext } from '../../types/context';
import { SupplyChainEvent } from '../../types/models';
import { requireAuth, requireRole } from '../helpers';
import { pubsub } from '../pubsub';

export const eventResolvers = {
  Query: {
    events: async (
      _: unknown,
      { pagination, filters }: { pagination?: unknown; filters?: unknown },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      const result = await eventService.findAll(pagination ?? {}, filters as never);
      return {
        items: result.items,
        pageInfo: { total: result.total, limit: result.limit, offset: result.offset, hasMore: result.hasMore },
      };
    },

    event: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return eventService.findById(id);
    },

    eventStats: async (_: unknown, { facilityId }: { facilityId: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      const stats = await eventService.getEventStats(facilityId);
      return { info: stats.info ?? 0, warning: stats.warning ?? 0, critical: stats.critical ?? 0 };
    },

    unprocessedEventCount: async (
      _: unknown,
      { facilityId }: { facilityId?: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      return eventService.getUnprocessedCount(facilityId);
    },
  },

  Mutation: {
    ingestEvent: async (_: unknown, { input }: { input: unknown }, ctx: GraphQLContext) => {
      requireRole(ctx, 'admin', 'operator');
      const event = await eventService.ingest(input);

      // Publish to GraphQL subscription
      pubsub.publish('EVENT_INGESTED', { eventIngested: event });
      if (event.severity === 'critical') {
        pubsub.publish('CRITICAL_EVENT', { criticalEvent: event });
      }

      return event;
    },

    markEventProcessed: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireRole(ctx, 'admin', 'operator');
      return eventService.markProcessed(id);
    },
  },

  Subscription: {
    eventIngested: {
      subscribe: (_: unknown, { facilityId, severity }: { facilityId?: string; severity?: string }) => {
        return pubsub.asyncIterator(['EVENT_INGESTED']);
      },
      resolve: (payload: { eventIngested: SupplyChainEvent }, args: { facilityId?: string; severity?: string }) => {
        const event = payload.eventIngested;
        if (args.facilityId && event.facility_id !== args.facilityId) return null;
        if (args.severity && event.severity !== args.severity) return null;
        return event;
      },
    },

    criticalEvent: {
      subscribe: () => pubsub.asyncIterator(['CRITICAL_EVENT']),
      resolve: (payload: { criticalEvent: SupplyChainEvent }) => payload.criticalEvent,
    },
  },

  Event: {
    assetId: (parent: SupplyChainEvent) => parent.asset_id,
    facilityId: (parent: SupplyChainEvent) => parent.facility_id,
    processedAt: (parent: SupplyChainEvent) => parent.processed_at,
    createdAt: (parent: SupplyChainEvent) => parent.created_at,

    asset: async (parent: SupplyChainEvent, _: unknown, ctx: GraphQLContext) => {
      return ctx.loaders.assetLoader.load(parent.asset_id);
    },

    facility: async (parent: SupplyChainEvent, _: unknown, ctx: GraphQLContext) => {
      return ctx.loaders.facilityLoader.load(parent.facility_id);
    },
  },
};
