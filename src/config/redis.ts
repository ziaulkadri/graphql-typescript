import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

const redisOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
  db: config.REDIS_DB,
  retryStrategy: (times: number) => {
    if (times > 10) {
      logger.error('Redis connection failed after 10 retries');
      return null;
    }
    return Math.min(times * 100, 3000);
  },
  lazyConnect: true,
  maxRetriesPerRequest: 3,
};

export const redis = new Redis(redisOptions);
export const redisSubscriber = new Redis(redisOptions);
export const redisPublisher = new Redis(redisOptions);

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));

export async function checkRedisConnection(): Promise<void> {
  await redis.connect();
  await redis.ping();
  logger.info('Redis connection verified');
}
