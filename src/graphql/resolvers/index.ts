import { DateTimeResolver, JSONResolver } from 'graphql-scalars';
import { authResolvers } from './auth.resolver';
import { facilityResolvers } from './facility.resolver';
import { assetResolvers } from './asset.resolver';
import { eventResolvers } from './event.resolver';
import { alertResolvers } from './alert.resolver';
import { analyticsResolvers } from './analytics.resolver';

export const resolvers = {
  DateTime: DateTimeResolver,
  JSON: JSONResolver,

  Query: {
    ...authResolvers.Query,
    ...facilityResolvers.Query,
    ...assetResolvers.Query,
    ...eventResolvers.Query,
    ...alertResolvers.Query,
    ...analyticsResolvers.Query,
  },

  Mutation: {
    ...authResolvers.Mutation,
    ...facilityResolvers.Mutation,
    ...assetResolvers.Mutation,
    ...eventResolvers.Mutation,
    ...alertResolvers.Mutation,
    ...analyticsResolvers.Mutation,
  },

  Subscription: {
    ...eventResolvers.Subscription,
    ...alertResolvers.Subscription,
  },

  User: authResolvers.User,
  Facility: facilityResolvers.Facility,
  Asset: assetResolvers.Asset,
  Event: eventResolvers.Event,
  Alert: alertResolvers.Alert,
};
