import { z } from 'zod'

export const createTagSchema = z.object({
  name: z.string().min(2).max(40).trim(),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case')
    .optional(),
})

export const updateTagSchema = z.object({
  name: z.string().min(2).max(40).trim().optional(),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case')
    .optional(),
})

export const tagIdParamSchema = z.object({ id: z.string().cuid() })
export const tagSlugParamSchema = z.object({ slug: z.string().min(1).max(50) })

export type CreateTagInput = z.infer<typeof createTagSchema>
export type UpdateTagInput = z.infer<typeof updateTagSchema>
