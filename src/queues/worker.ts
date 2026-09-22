import { Worker, type Job } from 'bullmq'
import { createBullConnection } from './connection'
import {
  POST_GENERATION_QUEUE,
  type GeneratePostJobData,
  type GeneratePostJobResult,
} from './postGeneration.queue'
import {
  SCHEDULER_QUEUE,
  JOB_PUBLISH_SCHEDULED,
  JOB_CLEANUP_DRAFTS,
  registerMaintenanceSchedules,
} from './scheduler.queue'
import { logger } from '../config/logger'
import { connectDatabase, disconnectDatabase } from '../config/database'
import { connectRedis, disconnectRedis } from '../config/redis'
import { generateArticle } from '../modules/ai/ai.service'
import { runPublishScheduled } from '../modules/scheduler/jobs/publishScheduled.job'
import { runCleanupDrafts } from '../modules/scheduler/jobs/cleanupDrafts.job'
import { syncCronJobs, recordCronRun } from '../modules/scheduler/scheduler.service'

/**
 * Standalone worker process (npm run worker). Kept separate from the web server
 * so slow AI generation never blocks HTTP request handling and can scale
 * independently.
 */

// Concurrency 1 by default — AI generation is expensive and rate-limited.
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 2)

async function processGeneratePost(
  job: Job<GeneratePostJobData, GeneratePostJobResult>,
): Promise<GeneratePostJobResult> {
  logger.info('processing generate-post job', {
    jobId: job.id,
    topic: job.data.topic,
    source: job.data.source,
    attempt: job.attemptsMade + 1,
  })

  const result = await generateArticle({
    topic: job.data.topic,
    categoryId: job.data.categoryId,
    authorId: job.data.authorId,
    ...(job.data.tagIds ? { tagIds: job.data.tagIds } : {}),
    ...(job.data.provider ? { provider: job.data.provider } : {}),
    ...(job.data.contentModel ? { contentModel: job.data.contentModel } : {}),
    ...(job.data.autoPublish !== undefined ? { autoPublish: job.data.autoPublish } : {}),
    ...(job.data.cronJobId ? { cronJobId: job.data.cronJobId } : {}),
  })

  // Update CronJob run stats when this generation was cron-triggered.
  if (job.data.source === 'cron' && job.data.cronJobId) {
    await recordCronRun(job.data.cronJobId, 'SUCCESS')
  }

  return { postId: result.postId, slug: result.slug, status: result.status }
}

/** Dispatch scheduler-queue jobs by name. */
async function processScheduler(job: Job): Promise<unknown> {
  switch (job.name) {
    case JOB_PUBLISH_SCHEDULED:
      return runPublishScheduled()
    case JOB_CLEANUP_DRAFTS:
      return runCleanupDrafts()
    default:
      logger.warn('unknown scheduler job', { name: job.name })
      return null
  }
}

async function main(): Promise<void> {
  // Workers need their own DB + Redis connections.
  await connectDatabase()
  await connectRedis()

  const workers: Worker[] = []

  const postGenWorker = new Worker<GeneratePostJobData, GeneratePostJobResult>(
    POST_GENERATION_QUEUE,
    processGeneratePost,
    { connection: createBullConnection(), concurrency: CONCURRENCY },
  )

  postGenWorker.on('completed', (job, result) => {
    logger.info('job completed', { jobId: job.id, postId: result.postId })
  })
  postGenWorker.on('failed', (job, err) => {
    logger.error('job failed', {
      jobId: job?.id,
      attempt: job?.attemptsMade,
      error: err.message,
    })
    // Record a cron failure only once retries are exhausted.
    if (
      job?.data?.source === 'cron' &&
      job.data.cronJobId &&
      job.attemptsMade >= (job.opts.attempts ?? 1)
    ) {
      void recordCronRun(job.data.cronJobId, 'FAILED')
    }
  })
  postGenWorker.on('error', (err) => logger.error('worker error', { error: err.message }))
  workers.push(postGenWorker)

  const schedulerWorker = new Worker(SCHEDULER_QUEUE, processScheduler, {
    connection: createBullConnection(),
    concurrency: 1,
  })
  schedulerWorker.on('completed', (job, result) => {
    logger.info('scheduler job completed', { name: job.name, result })
  })
  schedulerWorker.on('failed', (job, err) => {
    logger.error('scheduler job failed', { name: job?.name, error: err.message })
  })
  schedulerWorker.on('error', (err) => logger.error('scheduler worker error', { error: err.message }))
  workers.push(schedulerWorker)

  // Register fixed maintenance schedules + sync DB-defined generation crons.
  await registerMaintenanceSchedules()
  await syncCronJobs()

  logger.info(
    `👷 Worker started (concurrency ${CONCURRENCY}) — queues: ${POST_GENERATION_QUEUE}, ${SCHEDULER_QUEUE}`,
  )

  // ── Graceful shutdown ──────────────────────────────────────
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info(`${signal} received — closing workers`)
    await Promise.all(workers.map((w) => w.close()))
    await disconnectDatabase()
    await disconnectRedis()
    logger.info('Worker shutdown complete')
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  logger.error('Fatal worker error', {
    error: err instanceof Error ? err.message : String(err),
  })
  process.exit(1)
})
