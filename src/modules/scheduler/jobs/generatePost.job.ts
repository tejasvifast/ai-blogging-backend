import type { GeneratePostJobData } from '../../../queues/postGeneration.queue'
import type { AIProviderName } from '../../ai/providers/types'

/**
 * Shape of CronJob.config for a generation cron. Stored as JSON in the DB.
 * `authorId` is injected by the controller from the creating admin.
 */
export interface CronGenerationConfig {
  topic?: string
  topics?: string[]
  categoryId: string
  authorId: string
  tagIds?: string[]
  provider?: AIProviderName
  contentModel?: string
  autoPublish?: boolean
}

/**
 * Turn a CronJob's stored config into a generate-post job payload. When
 * multiple `topics` are configured, one is picked per run so a single cron can
 * cover a content calendar.
 */
export function cronConfigToJobData(
  cronJobId: string,
  config: CronGenerationConfig,
): GeneratePostJobData {
  const topic = pickTopic(config)
  return {
    topic,
    categoryId: config.categoryId,
    authorId: config.authorId,
    ...(config.tagIds ? { tagIds: config.tagIds } : {}),
    ...(config.provider ? { provider: config.provider } : {}),
    ...(config.contentModel ? { contentModel: config.contentModel } : {}),
    ...(config.autoPublish !== undefined ? { autoPublish: config.autoPublish } : {}),
    source: 'cron',
    cronJobId,
  }
}

function pickTopic(config: CronGenerationConfig): string {
  if (config.topics && config.topics.length > 0) {
    const idx = Math.floor(Math.random() * config.topics.length)
    return config.topics[idx] as string
  }
  if (config.topic) return config.topic
  throw new Error('Cron generation config has no topic or topics')
}
