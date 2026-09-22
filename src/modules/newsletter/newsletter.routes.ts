import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { validate } from '../../middleware/validate.middleware'
import { authLimiter } from '../../middleware/rateLimit.middleware'
import * as controller from './newsletter.controller'
import { subscribeSchema, tokenQuerySchema } from './newsletter.validator'

// ── Public → /newsletter ───────────────────────────────────────
export const newsletterRouter = Router()

/** @route POST /newsletter/subscribe — rate-limited to deter abuse */
newsletterRouter.post(
  '/subscribe',
  authLimiter,
  validate({ body: subscribeSchema }),
  asyncHandler(controller.subscribe),
)

/** @route GET /newsletter/verify?token= */
newsletterRouter.get(
  '/verify',
  validate({ query: tokenQuerySchema }),
  asyncHandler(controller.verify),
)

/** @route GET /newsletter/unsubscribe?token= */
newsletterRouter.get(
  '/unsubscribe',
  validate({ query: tokenQuerySchema }),
  asyncHandler(controller.unsubscribe),
)
