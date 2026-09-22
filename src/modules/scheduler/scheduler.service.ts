import type { CronJob, Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { logger } from '../../config/logger'
import { NotFoundError, BadRequestError } from '../../utils/errors'
import { postGenerationQueue } from '../../queues/postGeneration.queue'
import { schedulerQueue, JOB_PUBLISH_SCHEDULED, JOB_CLEANUP_DRAFTS } from '../../queues/scheduler.queue'
import { cronConfigToJobData, type CronGenerationConfig } from './jobs/generatePost.job'

const SCHEDULER_PREFIX = 'cron-'
const schedulerId = (cronJobId: string) => `${SCHEDULER_PREFIX}${cronJobId}`

/** Minimal 5-field cron validation (BullMQ validates fully on upsert). */
function assertCron(expr: string): void {
  if (expr.trim().split(/\s+/).length !== 5) {
    throw new BadRequestError('cronExpression must have 5 fields (min hour day month weekday)')
  }
}

// ── CronJob CRUD ───────────────────────────────────────────────

export function listCronJobs(): Promise<CronJob[]> {
  return prisma.cronJob.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function getCronJob(id: string): Promise<CronJob> {
  const job = await prisma.cronJob.findUnique({ where: { id } })
  if (!job) throw new NotFoundError('Cron job not found')
  return job
}

export async function createCronJob(input: {
  name: string
  description?: string
  cronExpression: string
  enabled?: boolean
  config: CronGenerationConfig
}): Promise<CronJob> {
  assertCron(input.cronExpression)
  const job = await prisma.cronJob.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      cronExpression: input.cronExpression,
      enabled: input.enabled ?? true,
      config: input.config as unknown as Prisma.InputJsonValue,
    },
  })
  await syncCronJobs()
  logger.info('cron job created', { cronJobId: job.id, name: job.name })
  return prisma.cronJob.findUniqueOrThrow({ where: { id: job.id } })
}

export async function updateCronJob(
  id: string,
  input: {
    name?: string
    description?: string | null
    cronExpression?: string
    enabled?: boolean
    config?: CronGenerationConfig
  },
): Promise<CronJob> {
  await getCronJob(id) // 404 if missing
  if (input.cronExpression) assertCron(input.cronExpression)

  const data: Prisma.CronJobUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  if (input.cronExpression !== undefined) data.cronExpression = input.cronExpression
  if (input.enabled !== undefined) data.enabled = input.enabled
  if (input.config !== undefined) data.config = input.config as unknown as Prisma.InputJsonValue

  const job = await prisma.cronJob.update({ where: { id }, data })
  await syncCronJobs()
  logger.info('cron job updated', { cronJobId: id })
  return job
}

export async function deleteCronJob(id: string): Promise<void> {
  await getCronJob(id)
  await prisma.cronJob.delete({ where: { id } })
  await postGenerationQueue.removeJobScheduler(schedulerId(id)).catch(() => {})
  logger.info('cron job deleted', { cronJobId: id })
}

/** Enqueue a generation job from a cron config immediately (test/run-now). */
export async function runCronNow(id: string): Promise<{ jobId: string }> {
  const cron = await getCronJob(id)
  const data = cronConfigToJobData(cron.id, cron.config as unknown as CronGenerationConfig)
  const job = await postGenerationQueue.add('generate-post', data)
  logger.info('cron job run manually', { cronJobId: id, jobId: job.id })
  return { jobId: job.id as string }
}

// ── Scheduler sync ─────────────────────────────────────────────

/**
 * Reconcile DB CronJob rows with BullMQ job schedulers: upsert one scheduler
 * per enabled row, remove schedulers for rows that were disabled/deleted.
 * Idempotent — safe to call at boot and after every CRUD mutation.
 */
export async function syncCronJobs(): Promise<void> {
  const [existing, enabled] = await Promise.all([
    postGenerationQueue.getJobSchedulers(),
    prisma.cronJob.findMany({ where: { enabled: true } }),
  ])

  const enabledIds = new Set(enabled.map((c) => schedulerId(c.id)))

  // Remove our schedulers that are no longer enabled.
  await Promise.all(
    existing
      .filter((s) => s.key.startsWith(SCHEDULER_PREFIX) && !enabledIds.has(s.key))
      .map((s) => postGenerationQueue.removeJobScheduler(s.key).catch(() => {})),
  )

  // Upsert enabled schedulers.
  for (const cron of enabled) {
    try {
      const data = cronConfigToJobData(cron.id, cron.config as unknown as CronGenerationConfig)
      await postGenerationQueue.upsertJobScheduler(
        schedulerId(cron.id),
        { pattern: cron.cronExpression },
        { name: 'generate-post', data },
      )
    } catch (err) {
      logger.error('failed to sync cron job', {
        cronJobId: cron.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  logger.info('cron jobs synced', { enabled: enabled.length })
}

/** Update a CronJob's run stats after one of its generation jobs finishes. */
export async function recordCronRun(
  cronJobId: string,
  status: 'SUCCESS' | 'FAILED',
): Promise<void> {
  await prisma.cronJob
    .update({
      where: { id: cronJobId },
      data: { lastRunAt: new Date(), lastRunStatus: status, runCount: { increment: 1 } },
    })
    .catch((e) => logger.warn('failed to record cron run', { cronJobId, error: String(e) }))
}

// ── Maintenance run-now (manual trigger) ───────────────────────

export async function runMaintenanceNow(
  which: 'publish-scheduled' | 'cleanup-drafts',
): Promise<{ jobId: string }> {
  const name = which === 'publish-scheduled' ? JOB_PUBLISH_SCHEDULED : JOB_CLEANUP_DRAFTS
  const job = await schedulerQueue.add(name, {})
  return { jobId: job.id as string }
}
