import type { Request, Response } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { sendSuccess, paginationMeta } from '../../utils/apiResponse'
import { NotFoundError, UnauthorizedError } from '../../utils/errors'
import { enqueuePostGeneration, postGenerationQueue } from '../../queues'

/**
 * @route POST /admin/ai/generate
 * Enqueues a generate-post job and returns 202 + a job id. The worker
 * (npm run worker) runs the pipeline asynchronously — poll GET /admin/ai/jobs/:id.
 */
export async function generate(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required')
  const { topic, categoryId, tagIds, provider, contentModel, autoPublish } = req.body

  const jobId = await enqueuePostGeneration({
    topic,
    categoryId,
    authorId: req.user.id,
    tagIds,
    provider,
    contentModel,
    autoPublish,
    source: 'manual',
  })

  sendSuccess(res, { jobId, status: 'queued' }, 202)
}

/**
 * @route GET /admin/ai/jobs/:id
 * Poll the state + result of a generation job.
 */
export async function jobStatus(req: Request, res: Response): Promise<void> {
  const job = await postGenerationQueue.getJob(req.params.id as string)
  if (!job) throw new NotFoundError('Job not found')

  const state = await job.getState()
  sendSuccess(res, {
    jobId: job.id,
    state, // waiting | active | completed | failed | delayed
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    result: job.returnvalue ?? null,
    failedReason: job.failedReason ?? null,
  })
}

/**
 * @route GET /admin/ai/logs
 * Paginated generation history with token/cost accounting.
 */
export async function listLogs(req: Request, res: Response): Promise<void> {
  const { page, limit, status } = req.query as unknown as {
    page: number
    limit: number
    status?: string
  }

  const where: Prisma.GenerationLogWhereInput = status ? { status } : {}

  const [logs, total] = await Promise.all([
    prisma.generationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.generationLog.count({ where }),
  ])

  sendSuccess(res, logs, 200, paginationMeta(page, limit, total) as unknown as Record<string, unknown>)
}
