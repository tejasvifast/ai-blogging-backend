import { z } from 'zod'

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color must be a hex value like #3b82f6')

export const createCategorySchema = z.object({
  name: z.string().min(2).max(50).trim(),
  description: z.string().max(300).trim().optional(),
  icon: z.string().max(50).optional(),
  color: hexColor.optional(),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case')
    .optional(),
})

export const updateCategorySchema = z.object({
  name: z.string().min(2).max(50).trim().optional(),
  description: z.string().max(300).trim().nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  color: hexColor.nullable().optional(),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case')
    .optional(),
})

export const categoryIdParamSchema = z.object({ id: z.string().cuid() })
export const categorySlugParamSchema = z.object({ slug: z.string().min(1).max(60) })

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
