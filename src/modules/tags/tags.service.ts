import { PostStatus, type Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { logger } from '../../config/logger'
import { NotFoundError, ConflictError } from '../../utils/errors'
import { toSlug } from '../../utils/text'
import type { CreateTagInput, UpdateTagInput } from './tags.validator'

const withPublishedCount = {
  _count: {
    select: { posts: { where: { status: PostStatus.PUBLISHED } } },
  },
} satisfies Prisma.TagInclude

export type TagWithCount = Prisma.TagGetPayload<{ include: typeof withPublishedCount }>

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = toSlug(base) || 'tag'
  let candidate = root
  let n = 1
  while (n < 1000) {
    const clash = await prisma.tag.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!clash || clash.id === excludeId) return candidate
    n += 1
    candidate = `${root}-${n}`
  }
  return `${root}-${Date.now()}`
}

export async function listAll(): Promise<TagWithCount[]> {
  return prisma.tag.findMany({ include: withPublishedCount, orderBy: { name: 'asc' } })
}

export async function getBySlug(slug: string): Promise<TagWithCount> {
  const tag = await prisma.tag.findUnique({ where: { slug }, include: withPublishedCount })
  if (!tag) throw new NotFoundError('Tag not found')
  return tag
}

export async function create(input: CreateTagInput): Promise<TagWithCount> {
  const existing = await prisma.tag.findUnique({ where: { name: input.name } })
  if (existing) throw new ConflictError('A tag with this name already exists')

  const tag = await prisma.tag.create({
    data: { name: input.name, slug: await uniqueSlug(input.slug ?? input.name) },
    include: withPublishedCount,
  })
  logger.info('tag created', { tagId: tag.id })
  return tag
}

export async function update(id: string, input: UpdateTagInput): Promise<TagWithCount> {
  const existing = await prisma.tag.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!existing) throw new NotFoundError('Tag not found')

  const data: Prisma.TagUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.slug !== undefined) {
    data.slug = await uniqueSlug(input.slug, id)
  } else if (input.name !== undefined && input.name !== existing.name) {
    data.slug = await uniqueSlug(input.name, id)
  }

  const tag = await prisma.tag.update({ where: { id }, data, include: withPublishedCount })
  logger.info('tag updated', { tagId: id })
  return tag
}

export async function remove(id: string): Promise<void> {
  const existing = await prisma.tag.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new NotFoundError('Tag not found')
  // Many-to-many: deleting a tag just detaches it from posts (no orphaned rows).
  await prisma.tag.delete({ where: { id } })
  logger.info('tag deleted', { tagId: id })
}
