import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { validate } from '../../middleware/validate.middleware'
import { requireAuth, requireRole } from '../../middleware/auth.middleware'
import * as controller from './scheduler.controller'
import {
  createCronJobSchema,
  updateCronJobSchema,
  cronIdParamSchema,
  maintenanceParamSchema,
} from './scheduler.validator'

// ── Admin → /admin/scheduler ───────────────────────────────────
export const adminSchedulerRouter = Router()

adminSchedulerRouter.use(requireAuth, requireRole('ADMIN'))

/** @route GET /admin/scheduler/cron-jobs */
adminSchedulerRouter.get('/cron-jobs', asyncHandler(controller.list))

/** @route POST /admin/scheduler/cron-jobs */
adminSchedulerRouter.post(
  '/cron-jobs',
  validate({ body: createCronJobSchema }),
  asyncHandler(controller.create),
)

/** @route GET /admin/scheduler/cron-jobs/:id */
adminSchedulerRouter.get(
  '/cron-jobs/:id',
  validate({ params: cronIdParamSchema }),
  asyncHandler(controller.get),
)

/** @route PATCH /admin/scheduler/cron-jobs/:id */
adminSchedulerRouter.patch(
  '/cron-jobs/:id',
  validate({ params: cronIdParamSchema, body: updateCronJobSchema }),
  asyncHandler(controller.update),
)

/** @route DELETE /admin/scheduler/cron-jobs/:id */
adminSchedulerRouter.delete(
  '/cron-jobs/:id',
  validate({ params: cronIdParamSchema }),
  asyncHandler(controller.remove),
)

/** @route POST /admin/scheduler/cron-jobs/:id/run — run a cron immediately */
adminSchedulerRouter.post(
  '/cron-jobs/:id/run',
  validate({ params: cronIdParamSchema }),
  asyncHandler(controller.runNow),
)

/** @route POST /admin/scheduler/maintenance/:task/run — trigger a maintenance job */
adminSchedulerRouter.post(
  '/maintenance/:task/run',
  validate({ params: maintenanceParamSchema }),
  asyncHandler(controller.runMaintenance),
)
