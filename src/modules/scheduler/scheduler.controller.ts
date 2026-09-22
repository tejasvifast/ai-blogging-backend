import type { Request, Response } from 'express'
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/apiResponse'
import { UnauthorizedError } from '../../utils/errors'
import * as service from './scheduler.service'
import type { CronGenerationConfig } from './jobs/generatePost.job'

export async function list(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listCronJobs())
}

export async function get(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.getCronJob(req.params.id as string))
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required')
  // Stamp the creating admin as the post author for generated content.
  const config: CronGenerationConfig = { ...req.body.config, authorId: req.user.id }
  const job = await service.createCronJob({ ...req.body, config })
  sendCreated(res, job)
}

export async function update(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required')
  const body = { ...req.body }
  if (body.config) body.config = { ...body.config, authorId: req.user.id }
  const job = await service.updateCronJob(req.params.id as string, body)
  sendSuccess(res, job)
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.deleteCronJob(req.params.id as string)
  sendNoContent(res)
}

/** Run a configured cron immediately (enqueues a generation job). */
export async function runNow(req: Request, res: Response): Promise<void> {
  const result = await service.runCronNow(req.params.id as string)
  sendSuccess(res, result, 202)
}

/** Manually trigger a maintenance task (publish-scheduled | cleanup-drafts). */
export async function runMaintenance(req: Request, res: Response): Promise<void> {
  const result = await service.runMaintenanceNow(
    req.params.task as 'publish-scheduled' | 'cleanup-drafts',
  )
  sendSuccess(res, result, 202)
}
