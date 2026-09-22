import { Queue } from 'bullmq'
import { queueConnection } from './connection'
import { logger } from '../config/logger'

export const SCHEDULER_QUEUE = 'scheduler'

/** Fixed maintenance job names processed by the worker. */
export const JOB_PUBLISH_SCHEDULED = 'publish-scheduled'
export const JOB_CLEANUP_DRAFTS = 'cleanup-drafts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const schedulerQueue = new Queue(SCHEDULER_QUEUE, {
  connection: queueConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 24 * 3600, count: 200 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
})

/**
 * Register the fixed maintenance schedules. Uses BullMQ Job Schedulers, which
 * are idempotent by id — safe to call on every boot.
 *   publish-scheduled → every 5 minutes
 *   cleanup-drafts    → daily at 3 AM
 */
export async function registerMaintenanceSchedules(): Promise<void> {
  await schedulerQueue.upsertJobScheduler(
    JOB_PUBLISH_SCHEDULED,
    { pattern: '*/5 * * * *' },
    { name: JOB_PUBLISH_SCHEDULED },
  )
  await schedulerQueue.upsertJobScheduler(
    JOB_CLEANUP_DRAFTS,
    { pattern: '0 3 * * *' },
    { name: JOB_CLEANUP_DRAFTS },
  )
  logger.info('maintenance schedules registered (publish-scheduled: */5m, cleanup-drafts: 3AM)')
}
