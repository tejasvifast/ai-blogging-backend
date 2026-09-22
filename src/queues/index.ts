import { postGenerationQueue } from './postGeneration.queue'
import { schedulerQueue } from './scheduler.queue'
import { closeQueueConnection } from './connection'
import { logger } from '../config/logger'

export { postGenerationQueue, enqueuePostGeneration } from './postGeneration.queue'
export type { GeneratePostJobData, GeneratePostJobResult } from './postGeneration.queue'
export { POST_GENERATION_QUEUE } from './postGeneration.queue'
export { schedulerQueue, registerMaintenanceSchedules, SCHEDULER_QUEUE } from './scheduler.queue'

/** Close every queue + the shared producer connection (graceful shutdown). */
export async function closeQueues(): Promise<void> {
  await postGenerationQueue.close()
  await schedulerQueue.close()
  await closeQueueConnection()
  logger.info('Queues closed')
}
