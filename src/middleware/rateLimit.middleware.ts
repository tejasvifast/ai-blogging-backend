import rateLimit, { type Options, type RateLimitRequestHandler } from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import type { Request } from 'express'
import { redis } from '../config/redis'
import { isTest } from '../config/env'
import { TooManyRequestsError } from '../utils/errors'

/**
 * Build a limiter backed by Redis so limits are shared across all instances
 * (critical on a horizontally-scaled deploy). In tests we skip Redis and use
 * the in-memory store so specs don't need a live server.
 */
function makeLimiter(opts: {
  windowMs: number
  max: number
  prefix: string
  byUser?: boolean
}): RateLimitRequestHandler {
  const config: Partial<Options> = {
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Key on the authenticated user when available, else the client IP.
    keyGenerator: (req: Request) => {
      if (opts.byUser && req.user?.id) return `u:${req.user.id}`
      return `ip:${req.ip ?? 'unknown'}`
    },
    handler: (_req, _res, next) => {
      next(new TooManyRequestsError())
    },
  }

  if (!isTest) {
    config.store = new RedisStore({
      // rate-limit-redis talks to ioredis via .call(); the first arg is the
      // command name, so pass it explicitly to satisfy call()'s signature.
      sendCommand: (...args: string[]) =>
        redis.call(args[0] as string, ...args.slice(1)) as Promise<never>,
      prefix: `rl:${opts.prefix}:`,
    })
  }

  return rateLimit(config)
}

/** /auth/* — 5 requests / minute (brute-force protection). */
export const authLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 5,
  prefix: 'auth',
})

/** /admin/ai/generate — 10 requests / hour (AI spend guard), keyed per user. */
export const aiGenerateLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  prefix: 'ai',
  byUser: true,
})

/** Global fallback — 100 requests / 15 minutes. */
export const generalLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  prefix: 'general',
})
