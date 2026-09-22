import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { validate } from '../../middleware/validate.middleware'
import { requireAuth, requireRole } from '../../middleware/auth.middleware'
import * as controller from './posts.controller'
import {
  createPostSchema,
  updatePostSchema,
  listPublicQuerySchema,
  listAdminQuerySchema,
  idParamSchema,
  slugParamSchema,
} from './posts.validator'

// ── Public router → mounted at /posts ──────────────────────────
export const publicPostRouter = Router()

/** @route GET /posts — list published posts (paginated, filterable) */
publicPostRouter.get(
  '/',
  validate({ query: listPublicQuerySchema }),
  asyncHandler(controller.listPublic),
)

/** @route GET /posts/:slug — single published post (increments views) */
publicPostRouter.get(
  '/:slug',
  validate({ params: slugParamSchema }),
  asyncHandler(controller.getBySlug),
)

// ── Admin router → mounted at /admin/posts ─────────────────────
export const adminPostRouter = Router()

// Every admin route requires a valid token.
adminPostRouter.use(requireAuth)

/** @route GET /admin/posts — list posts of any status */
adminPostRouter.get(
  '/',
  requireRole('ADMIN', 'EDITOR'),
  validate({ query: listAdminQuerySchema }),
  asyncHandler(controller.listAdmin),
)

/** @route POST /admin/posts — create a post */
adminPostRouter.post(
  '/',
  requireRole('ADMIN', 'EDITOR'),
  validate({ body: createPostSchema }),
  asyncHandler(controller.create),
)

/** @route GET /admin/posts/:id — fetch a post by id */
adminPostRouter.get(
  '/:id',
  requireRole('ADMIN', 'EDITOR'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.getByIdAdmin),
)

/** @route PATCH /admin/posts/:id — update a post */
adminPostRouter.patch(
  '/:id',
  requireRole('ADMIN', 'EDITOR'),
  validate({ params: idParamSchema, body: updatePostSchema }),
  asyncHandler(controller.update),
)

/** @route POST /admin/posts/:id/publish — publish immediately */
adminPostRouter.post(
  '/:id/publish',
  requireRole('ADMIN', 'EDITOR'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.publish),
)

/** @route DELETE /admin/posts/:id — delete a post (ADMIN only) */
adminPostRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(controller.remove),
)
