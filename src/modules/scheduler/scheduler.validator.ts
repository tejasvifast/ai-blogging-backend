import { z } from 'zod'

const cuid = z.string().cuid()

/** Generation config stored on a CronJob (authorId injected by controller). */
export const cronConfigInputSchema = z
  .object({
    topic: z.string().min(5).max(200).optional(),
    topics: z.array(z.string().min(5).max(200)).min(1).max(50).optional(),
    categoryId: cuid,
    tagIds: z.array(cuid).max(20).optional(),
    provider: z.enum(['anthropic', 'openai']).optional(),
    contentModel: z.string().min(1).max(60).optional(),
    autoPublish: z.boolean().default(false),
  })
  .refine((c) => Boolean(c.topic) || (c.topics && c.topics.length > 0), {
    message: 'Provide either "topic" or a non-empty "topics" array',
    path: ['topic'],
  })

export const createCronJobSchema = z.object({
  name: z.string().min(2).max(80).trim(),
  description: z.string().max(300).optional(),
  cronExpression: z.string().min(9).max(120),
  enabled: z.boolean().default(true),
  config: cronConfigInputSchema,
})

export const updateCronJobSchema = z.object({
  name: z.string().min(2).max(80).trim().optional(),
  description: z.string().max(300).nullable().optional(),
  cronExpression: z.string().min(9).max(120).optional(),
  enabled: z.boolean().optional(),
  config: cronConfigInputSchema.optional(),
})

export const cronIdParamSchema = z.object({ id: cuid })

export const maintenanceParamSchema = z.object({
  task: z.enum(['publish-scheduled', 'cleanup-drafts']),
})

export type CronConfigInput = z.infer<typeof cronConfigInputSchema>
