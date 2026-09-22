import { PostStatus, type Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { logger } from '../../config/logger'
import { NotFoundError, ConflictError } from '../../utils/errors'
import { toSlug } from '../../utils/text'
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.validator'

// Each category carries a count of its PUBLISHED posts (filtered relation count).
const withPublishedCount = {
  _count: {
    select: { posts: { where: { status: PostStatus.PUBLISHED } } },
  },
} satisfies Prisma.CategoryInclude

export type CategoryWithCount = Prisma.CategoryGetPayload<{ include: typeof withPublishedCount }>

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = toSlug(base) || 'category'
  let candidate = root
  let n = 1
  while (n < 1000) {
    const clash = await prisma.category.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!clash || clash.id === excludeId) return candidate
    n += 1
    candidate = `${root}-${n}`
  }
  return `${root}-${Date.now()}`
}

export async function listAll(): Promise<CategoryWithCount[]> {
  return prisma.category.findMany({
    include: withPublishedCount,
    orderBy: { name: 'asc' },
  })
}

export async function getBySlug(slug: string): Promise<CategoryWithCount> {
  const category = await prisma.category.findUnique({
    where: { slug },
    include: withPublishedCount,
  })
  if (!category) throw new NotFoundError('Category not found')
  return category
}

export async function create(input: CreateCategoryInput): Promise<CategoryWithCount> {
  const existing = await prisma.category.findUnique({ where: { name: input.name } })
  if (existing) throw new ConflictError('A category with this name already exists')

  const category = await prisma.category.create({
    data: {
      name: input.name,
      slug: await uniqueSlug(input.slug ?? input.name),
      description: input.description ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
    },
    include: withPublishedCount,
  })
  logger.info('category created', { categoryId: category.id })
  return category
}

export async function update(id: string, input: UpdateCategoryInput): Promise<CategoryWithCount> {
  const existing = await prisma.category.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!existing) throw new NotFoundError('Category not found')

  const data: Prisma.CategoryUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  if (input.icon !== undefined) data.icon = input.icon
  if (input.color !== undefined) data.color = input.color

  if (input.slug !== undefined) {
    data.slug = await uniqueSlug(input.slug, id)
  } else if (input.name !== undefined && input.name !== existing.name) {
    data.slug = await uniqueSlug(input.name, id)
  }

  const category = await prisma.category.update({ where: { id }, data, include: withPublishedCount })
  logger.info('category updated', { categoryId: id })
  return category
}

export async function remove(id: string): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id },
    select: { id: true, _count: { select: { posts: true } } },
  })
  if (!category) throw new NotFoundError('Category not found')

  // Posts require a category (FK is non-null), so block deletion while any exist.
  if (category._count.posts > 0) {
    throw new ConflictError(
      `Cannot delete category with ${category._count.posts} post(s). Reassign or delete them first.`,
    )
  }

  await prisma.category.delete({ where: { id } })
  logger.info('category deleted', { categoryId: id })
}
