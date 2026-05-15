import { analyticsService, MetricInput } from '../../services/analytics.service';
import { GraphQLContext } from '../../types/context';
import { requireAuth, requireRole } from '../helpers';

export const analyticsResolvers = {
  Query: {
    timeSeries: async (
      _: unknown,
      { input }: { input: {
        assetId?: string;
        facilityId?: string;
        metricName: string;
        from: Date;
        to: Date;
        interval?: string;
      }},
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      return analyticsService.getTimeSeries({
        asset_id: input.assetId,
        facility_id: input.facilityId,
        metric_name: input.metricName,
        from: new Date(input.from),
        to: new Date(input.to),
        interval: input.interval as never,
      });
    },

    dashboardSummary: async (
      _: unknown,
      { facilityId }: { facilityId: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      return analyticsService.getDashboardSummary(facilityId);
    },
  },

  Mutation: {
    recordMetrics: async (
      _: unknown,
      { metrics }: { metrics: Array<{
        facilityId?: string;
        assetId?: string;
        metricName: string;
        metricValue: number;
        tags?: Record<string, string>;
      }>},
      ctx: GraphQLContext
    ) => {
      requireRole(ctx, 'admin', 'operator');
      const normalized: MetricInput[] = metrics.map((m) => ({
        facility_id: m.facilityId,
        asset_id: m.assetId,
        metric_name: m.metricName,
        metric_value: m.metricValue,
        tags: m.tags,
      }));
      await analyticsService.record(normalized);
      return true;
    },
  },
};
