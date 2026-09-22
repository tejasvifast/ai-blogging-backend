import { z } from 'zod'

export const generateArticleSchema = z.object({
  topic: z.string().min(5, 'Topic must be at least 5 characters').max(200).trim(),
  categoryId: z.string().cuid(),
  tagIds: z.array(z.string().cuid()).max(20).optional(),
  provider: z.enum(['anthropic', 'openai']).optional(),
  contentModel: z.string().min(1).max(60).optional(),
  autoPublish: z.boolean().default(false),
})

export const listLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['SUCCESS', 'FAILED']).optional(),
})

export const jobIdParamSchema = z.object({ id: z.string().min(1).max(120) })

export type GenerateArticleBody = z.infer<typeof generateArticleSchema>
