import { Queue, type JobsOptions } from 'bullmq'
import { queueConnection } from './connection'
import type { AIProviderName } from '../modules/ai/providers/types'

export const POST_GENERATION_QUEUE = 'post-generation'

/** Payload for a generate-post job. */
export interface GeneratePostJobData {
  topic: string
  categoryId: string
  authorId: string
  tagIds?: string[]
  provider?: AIProviderName
  contentModel?: string
  autoPublish?: boolean
  /** Where the job came from — for auditing cron vs manual generation. */
  source: 'manual' | 'cron'
  cronJobId?: string
}

export interface GeneratePostJobResult {
  postId: string
  slug: string
  status: string
}

/** Sensible defaults: retry transient failures, keep history bounded. */
const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { age: 24 * 3600, count: 500 },
  removeOnFail: { age: 7 * 24 * 3600 },
}

export const postGenerationQueue = new Queue<GeneratePostJobData, GeneratePostJobResult>(
  POST_GENERATION_QUEUE,
  {
    connection: queueConnection(),
    defaultJobOptions,
  },
)

/** Enqueue a generate-post job; returns the job id for status polling. */
export async function enqueuePostGeneration(data: GeneratePostJobData): Promise<string> {
  const job = await postGenerationQueue.add('generate-post', data)
  return job.id as string
}
