import { Redis } from 'ioredis'
import { env } from '../config/env'

/**
 * BullMQ needs a Redis connection with `maxRetriesPerRequest: null` (blocking
 * commands like BRPOPLPUSH must never be aborted mid-wait). This is a separate
 * connection from the general-purpose client in config/redis.ts.
 *
 * Queues (producers) can share one non-blocking connection. Workers do blocking
 * reads and each need their own — use createBullConnection() for those.
 */
export function createBullConnection(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })
}

/** Shared connection for queue producers (enqueue side). */
let shared: Redis | null = null
export function queueConnection(): Redis {
  if (!shared) shared = createBullConnection()
  return shared
}

export async function closeQueueConnection(): Promise<void> {
  if (shared) {
    await shared.quit()
    shared = null
  }
}
