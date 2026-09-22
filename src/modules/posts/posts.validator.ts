import { z } from 'zod'
import { PostStatus } from '@prisma/client'

/** Query-string boolean: only literal "true"/"false" (z.coerce.boolean is unsafe). */
const boolParam = z
  .union([z.literal('true'), z.literal('false'), z.boolean()])
  .transform((v) => v === true || v === 'true')

const cuid = z.string().cuid()

// ── Create / update ────────────────────────────────────────────

export const createPostSchema = z
  .object({
    title: z.string().min(3).max(200).trim(),
    content: z.string().min(1, 'Content is required'),
    excerpt: z.string().max(400).trim().optional(),
    slug: z
      .string()
      .min(3)
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case')
      .optional(),
    coverImage: z.string().url().optional(),
    coverImageAlt: z.string().max(200).optional(),
    metaTitle: z.string().max(70).optional(),
    metaDescription: z.string().max(200).optional(),
    keywords: z.array(z.string().min(1)).max(15).default([]),
    categoryId: cuid,
    tagIds: z.array(cuid).max(20).default([]),
    status: z.nativeEnum(PostStatus).default(PostStatus.DRAFT),
    isFeatured: z.boolean().default(false),
    scheduledFor: z.coerce.date().optional(),
  })
  .refine(
    (v) => v.status !== PostStatus.SCHEDULED || (v.scheduledFor && v.scheduledFor > new Date()),
    { message: 'scheduledFor must be a future date when status is SCHEDULED', path: ['scheduledFor'] },
  )

// All fields optional for PATCH; re-check the scheduled invariant when present.
export const updatePostSchema = z
  .object({
    title: z.string().min(3).max(200).trim().optional(),
    content: z.string().min(1).optional(),
    excerpt: z.string().max(400).trim().optional(),
    slug: z
      .string()
      .min(3)
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case')
      .optional(),
    coverImage: z.string().url().nullable().optional(),
    coverImageAlt: z.string().max(200).nullable().optional(),
    metaTitle: z.string().max(70).nullable().optional(),
    metaDescription: z.string().max(200).nullable().optional(),
    keywords: z.array(z.string().min(1)).max(15).optional(),
    categoryId: cuid.optional(),
    tagIds: z.array(cuid).max(20).optional(),
    status: z.nativeEnum(PostStatus).optional(),
    isFeatured: z.boolean().optional(),
    scheduledFor: z.coerce.date().nullable().optional(),
  })
  .refine(
    (v) =>
      v.status !== PostStatus.SCHEDULED ||
      (v.scheduledFor instanceof Date && v.scheduledFor > new Date()),
    { message: 'scheduledFor must be a future date when status is SCHEDULED', path: ['scheduledFor'] },
  )

// ── Query params ───────────────────────────────────────────────

const basePagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().optional(), // category slug
  tag: z.string().trim().optional(), // tag slug
  sort: z.enum(['newest', 'oldest', 'popular']).default('newest'),
}

export const listPublicQuerySchema = z.object({
  ...basePagination,
  featured: boolParam.optional(),
})

export const listAdminQuerySchema = z.object({
  ...basePagination,
  featured: boolParam.optional(),
  status: z.nativeEnum(PostStatus).optional(),
})

export const idParamSchema = z.object({ id: cuid })
export const slugParamSchema = z.object({ slug: z.string().min(1).max(200) })

export type CreatePostInput = z.infer<typeof createPostSchema>
export type UpdatePostInput = z.infer<typeof updatePostSchema>
export type ListPublicQuery = z.infer<typeof listPublicQuerySchema>
export type ListAdminQuery = z.infer<typeof listAdminQuerySchema>
