import { redis } from '../config/redis';
import { config } from '../config';
import { logger } from '../utils/logger';

export enum CacheTTL {
  SHORT = 'SHORT',
  MEDIUM = 'MEDIUM',
  LONG = 'LONG',
}

const TTL_MAP = {
  [CacheTTL.SHORT]: config.CACHE_TTL_SHORT,
  [CacheTTL.MEDIUM]: config.CACHE_TTL_MEDIUM,
  [CacheTTL.LONG]: config.CACHE_TTL_LONG,
};

export class CacheService {
  private prefix: string;

  constructor(namespace: string) {
    this.prefix = `koi:${namespace}`;
  }

  private key(id: string): string {
    return `${this.prefix}:${id}`;
  }

  async get<T>(id: string): Promise<T | null> {
    try {
      const data = await redis.get(this.key(id));
      return data ? (JSON.parse(data) as T) : null;
    } catch (err) {
      logger.warn('Cache get error', { key: this.key(id), error: (err as Error).message });
      return null;
    }
  }

  async set<T>(id: string, value: T, ttl: CacheTTL = CacheTTL.MEDIUM): Promise<void> {
    try {
      await redis.setex(this.key(id), TTL_MAP[ttl], JSON.stringify(value));
    } catch (err) {
      logger.warn('Cache set error', { key: this.key(id), error: (err as Error).message });
    }
  }

  async del(id: string): Promise<void> {
    try {
      await redis.del(this.key(id));
    } catch (err) {
      logger.warn('Cache del error', { key: this.key(id), error: (err as Error).message });
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(`${this.prefix}:${pattern}`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (err) {
      logger.warn('Cache delPattern error', { error: (err as Error).message });
    }
  }

  // Cache-aside pattern: fetch from cache or run loader and cache result
  async getOrSet<T>(
    id: string,
    loader: () => Promise<T>,
    ttl: CacheTTL = CacheTTL.MEDIUM
  ): Promise<T> {
    const cached = await this.get<T>(id);
    if (cached !== null) return cached;

    const value = await loader();
    if (value !== null && value !== undefined) {
      await this.set(id, value, ttl);
    }
    return value;
  }

  async increment(id: string, by = 1): Promise<number> {
    return redis.incrby(this.key(id), by);
  }

  async expire(id: string, seconds: number): Promise<void> {
    await redis.expire(this.key(id), seconds);
  }
}

// Publish to a Redis pub/sub channel
export async function publish(channel: string, data: unknown): Promise<void> {
  const { redisPublisher } = await import('../config/redis');
  await redisPublisher.publish(channel, JSON.stringify(data));
}
