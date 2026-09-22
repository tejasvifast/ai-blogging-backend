import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { prisma } from '../../config/database'
import { redis } from '../../config/redis'

const router = Router()

/**
 * @route GET /health/live
 * @desc  Liveness — process is up. Never touches dependencies.
 */
router.get('/live', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() })
})

/**
 * @route GET /health  (and /health/ready)
 * @desc  Readiness — verifies DB + Redis connectivity.
 */
const readiness = asyncHandler(async (_req, res) => {
  const checks: Record<string, 'ok' | 'down'> = { database: 'down', redis: 'down' }

  const [db, cache] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
  ])
  if (db.status === 'fulfilled') checks.database = 'ok'
  if (cache.status === 'fulfilled' && cache.value === 'PONG') checks.redis = 'ok'

  const healthy = Object.values(checks).every((v) => v === 'ok')
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  })
})

router.get('/', readiness)
router.get('/ready', readiness)

export default router
