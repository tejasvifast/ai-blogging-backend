import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { validate } from '../../middleware/validate.middleware'
import { requireAuth, requireRole } from '../../middleware/auth.middleware'
import * as controller from './tags.controller'
import {
  createTagSchema,
  updateTagSchema,
  tagIdParamSchema,
  tagSlugParamSchema,
} from './tags.validator'

// ── Public → /tags ─────────────────────────────────────────────
export const publicTagRouter = Router()

publicTagRouter.get('/', asyncHandler(controller.list))
publicTagRouter.get(
  '/:slug',
  validate({ params: tagSlugParamSchema }),
  asyncHandler(controller.getBySlug),
)

// ── Admin → /admin/tags ────────────────────────────────────────
export const adminTagRouter = Router()
adminTagRouter.use(requireAuth)

adminTagRouter.post(
  '/',
  requireRole('ADMIN', 'EDITOR'),
  validate({ body: createTagSchema }),
  asyncHandler(controller.create),
)

adminTagRouter.patch(
  '/:id',
  requireRole('ADMIN', 'EDITOR'),
  validate({ params: tagIdParamSchema, body: updateTagSchema }),
  asyncHandler(controller.update),
)

adminTagRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: tagIdParamSchema }),
  asyncHandler(controller.remove),
)
