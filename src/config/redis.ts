import { Redis, type RedisOptions } from 'ioredis'
import { env } from './env'
import { logger } from './logger'

/**
 * Shared ioredis options.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on the connection it uses for
 * blocking commands, so we expose these options for the queue layer to reuse
 * (see src/queues/connection.ts) while this module owns the general-purpose
 * client used for caching, rate limiting, etc.
 */
export const redisOptions: RedisOptions = {
  // Upstash uses TLS (rediss://); ioredis picks this up from the URL, but we
  // set it explicitly so a plain redis:// URL in local dev still behaves.
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 200, 2000)
    return delay
  },
}

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

export const redis =
  globalForRedis.redis ?? new Redis(env.REDIS_URL, redisOptions)

redis.on('connect', () => logger.info('✅ Redis connected'))
redis.on('ready', () => logger.debug('Redis ready'))
redis.on('error', (err) => logger.error('Redis error', { message: err.message }))
redis.on('close', () => logger.warn('Redis connection closed'))
redis.on('reconnecting', () => logger.debug('Redis reconnecting'))

if (env.NODE_ENV !== 'production') globalForRedis.redis = redis

/**
 * Ping Redis at boot so a bad REDIS_URL fails fast.
 */
export async function connectRedis(): Promise<void> {
  const pong = await redis.ping()
  if (pong !== 'PONG') throw new Error(`Unexpected Redis ping response: ${pong}`)
  logger.info('✅ Redis reachable')
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit()
  logger.info('Redis disconnected')
}
