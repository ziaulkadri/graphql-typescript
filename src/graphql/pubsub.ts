import { PubSub } from 'graphql-subscriptions';

// In production, replace with Redis-backed PubSub for multi-instance deployments:
// import { RedisPubSub } from 'graphql-redis-subscriptions';
export const pubsub = new PubSub();
