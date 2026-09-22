import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { validate } from '../../middleware/validate.middleware'
import { requireAuth, requireRole } from '../../middleware/auth.middleware'
import * as controller from './categories.controller'
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
  categorySlugParamSchema,
} from './categories.validator'

// ── Public → /categories ───────────────────────────────────────
export const publicCategoryRouter = Router()

/** @route GET /categories — all categories with published-post counts */
publicCategoryRouter.get('/', asyncHandler(controller.list))

/** @route GET /categories/:slug */
publicCategoryRouter.get(
  '/:slug',
  validate({ params: categorySlugParamSchema }),
  asyncHandler(controller.getBySlug),
)

// ── Admin → /admin/categories ──────────────────────────────────
export const adminCategoryRouter = Router()
adminCategoryRouter.use(requireAuth)

adminCategoryRouter.post(
  '/',
  requireRole('ADMIN', 'EDITOR'),
  validate({ body: createCategorySchema }),
  asyncHandler(controller.create),
)

adminCategoryRouter.patch(
  '/:id',
  requireRole('ADMIN', 'EDITOR'),
  validate({ params: categoryIdParamSchema, body: updateCategorySchema }),
  asyncHandler(controller.update),
)

adminCategoryRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: categoryIdParamSchema }),
  asyncHandler(controller.remove),
)
