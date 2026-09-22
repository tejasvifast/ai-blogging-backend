import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { validate } from '../../middleware/validate.middleware'
import { requireAuth, requireRole } from '../../middleware/auth.middleware'
import { aiGenerateLimiter } from '../../middleware/rateLimit.middleware'
import * as controller from './ai.controller'
import { generateArticleSchema, listLogsQuerySchema, jobIdParamSchema } from './ai.validator'

// ── Admin → /admin/ai ──────────────────────────────────────────
export const adminAiRouter = Router()

adminAiRouter.use(requireAuth)

/** @route POST /admin/ai/generate — generate an article (10/hour per user) */
adminAiRouter.post(
  '/generate',
  requireRole('ADMIN', 'EDITOR'),
  aiGenerateLimiter,
  validate({ body: generateArticleSchema }),
  asyncHandler(controller.generate),
)

/** @route GET /admin/ai/jobs/:id — poll a generation job's status/result */
adminAiRouter.get(
  '/jobs/:id',
  requireRole('ADMIN', 'EDITOR'),
  validate({ params: jobIdParamSchema }),
  asyncHandler(controller.jobStatus),
)

/** @route GET /admin/ai/logs — generation history + cost accounting */
adminAiRouter.get(
  '/logs',
  requireRole('ADMIN', 'EDITOR'),
  validate({ query: listLogsQuerySchema }),
  asyncHandler(controller.listLogs),
)
