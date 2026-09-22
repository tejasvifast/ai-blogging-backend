import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../utils/asyncHandler'
import { validate } from '../../middleware/validate.middleware'
import { requireAuth, requireRole } from '../../middleware/auth.middleware'
import { sendSuccess } from '../../utils/apiResponse'
import { triggerRevalidation } from './revalidation.service'

const bodySchema = z.object({
  paths: z.array(z.string().startsWith('/')).min(1).max(50),
})

// ── Admin → /admin/revalidate ──────────────────────────────────
export const adminRevalidationRouter = Router()

adminRevalidationRouter.use(requireAuth, requireRole('ADMIN'))

/** @route POST /admin/revalidate — manually bust ISR cache for given paths */
adminRevalidationRouter.post(
  '/',
  validate({ body: bodySchema }),
  asyncHandler(async (req, res) => {
    await triggerRevalidation(req.body.paths)
    sendSuccess(res, { revalidated: req.body.paths })
  }),
)
