import { Prisma, PostStatus } from '@prisma/client'
import { prisma } from '../../config/database'
import { logger } from '../../config/logger'
import { NotFoundError } from '../../utils/errors'
import { toSlug, readingTimeMinutes, deriveExcerpt } from '../../utils/text'
import type { Paginated } from '../../utils/apiResponse'
import { paginationMeta } from '../../utils/apiResponse'
import { triggerRevalidation, postPaths } from '../revalidation/revalidation.service'
import type {
  CreatePostInput,
  UpdatePostInput,
  ListPublicQuery,
  ListAdminQuery,
} from './posts.validator'

// Public author fields only — never leak email/role on public posts.
const authorSelect = { id: true, name: true, avatar: true, bio: true } as const
const postInclude = {
  author: { select: authorSelect },
  category: true,
  tags: true,
} satisfies Prisma.PostInclude

export type PostWithRelations = Prisma.PostGetPayload<{ include: typeof postInclude }>

interface PostList {
  posts: PostWithRelations[]
  meta: Paginated
}

// ── Helpers ────────────────────────────────────────────────────

/** Ensure slug uniqueness by suffixing -2, -3, ... when needed. */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = toSlug(base) || 'post'
  let candidate = root
  let n = 1
  // Bounded loop — practically resolves in one or two iterations.
  while (n < 1000) {
    const clash = await prisma.post.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!clash || clash.id === excludeId) return candidate
    n += 1
    candidate = `${root}-${n}`
  }
  return `${root}-${Date.now()}`
}

/**
 * Fire-and-forget ISR revalidation for a post's pages plus the listing pages.
 * When the slug changed, the old URL is revalidated too so it drops out of ISR.
 */
function revalidateForPost(post: PostWithRelations, previousSlug?: string): void {
  const paths = new Set(postPaths(post.slug, post.category.slug))
  if (previousSlug && previousSlug !== post.slug) {
    postPaths(previousSlug, post.category.slug).forEach((p) => paths.add(p))
  }
  void triggerRevalidation([...paths])
}

function orderBy(sort: ListPublicQuery['sort']): Prisma.PostOrderByWithRelationInput {
  switch (sort) {
    case 'oldest':
      return { publishedAt: 'asc' }
    case 'popular':
      return { views: 'desc' }
    default:
      return { publishedAt: 'desc' }
  }
}

// ── Public reads ───────────────────────────────────────────────

export async function listPublic(query: ListPublicQuery): Promise<PostList> {
  const { page, limit, search, category, tag, featured, sort } = query

  const where: Prisma.PostWhereInput = {
    status: PostStatus.PUBLISHED,
    publishedAt: { lte: new Date() },
    ...(featured !== undefined ? { isFeatured: featured } : {}),
    ...(category ? { category: { slug: category } } : {}),
    ...(tag ? { tags: { some: { slug: tag } } } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { excerpt: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: postInclude,
      orderBy: orderBy(sort),
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.post.count({ where }),
  ])

  return { posts, meta: paginationMeta(page, limit, total) }
}

export async function getPublicBySlug(slug: string): Promise<PostWithRelations> {
  const post = await prisma.post.findFirst({
    where: { slug, status: PostStatus.PUBLISHED, publishedAt: { lte: new Date() } },
    include: postInclude,
  })
  if (!post) throw new NotFoundError('Post not found')

  // Fire-and-forget view increment — never block the response or fail the read.
  prisma.post
    .update({ where: { id: post.id }, data: { views: { increment: 1 } } })
    .catch((e) => logger.warn('view increment failed', { postId: post.id, error: String(e) }))

  return post
}

// ── Admin reads ────────────────────────────────────────────────

export async function listAdmin(query: ListAdminQuery): Promise<PostList> {
  const { page, limit, search, category, tag, featured, status, sort } = query

  const where: Prisma.PostWhereInput = {
    ...(status ? { status } : {}),
    ...(featured !== undefined ? { isFeatured: featured } : {}),
    ...(category ? { category: { slug: category } } : {}),
    ...(tag ? { tags: { some: { slug: tag } } } : {}),
    ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
  }

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: postInclude,
      orderBy: sort === 'popular' ? { views: 'desc' } : { createdAt: sort === 'oldest' ? 'asc' : 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.post.count({ where }),
  ])

  return { posts, meta: paginationMeta(page, limit, total) }
}

export async function getByIdAdmin(id: string): Promise<PostWithRelations> {
  const post = await prisma.post.findUnique({ where: { id }, include: postInclude })
  if (!post) throw new NotFoundError('Post not found')
  return post
}

// ── Mutations ──────────────────────────────────────────────────

/** Compute publishedAt/scheduledFor consistent with the target status. */
function timing(
  status: PostStatus,
  scheduledFor: Date | null | undefined,
  current?: { publishedAt: Date | null },
): { publishedAt: Date | null; scheduledFor: Date | null } {
  if (status === PostStatus.PUBLISHED) {
    return { publishedAt: current?.publishedAt ?? new Date(), scheduledFor: null }
  }
  if (status === PostStatus.SCHEDULED) {
    return { publishedAt: null, scheduledFor: scheduledFor ?? null }
  }
  // DRAFT / ARCHIVED
  return { publishedAt: current?.publishedAt ?? null, scheduledFor: null }
}

export async function createPost(
  input: CreatePostInput,
  authorId: string,
): Promise<PostWithRelations> {
  const slug = await uniqueSlug(input.slug ?? input.title)
  const { publishedAt, scheduledFor } = timing(input.status, input.scheduledFor ?? null)

  const post = await prisma.post.create({
    data: {
      title: input.title,
      slug,
      content: input.content,
      excerpt: input.excerpt ?? deriveExcerpt(input.content),
      coverImage: input.coverImage ?? null,
      coverImageAlt: input.coverImageAlt ?? null,
      metaTitle: input.metaTitle ?? input.title.slice(0, 70),
      metaDescription: input.metaDescription ?? deriveExcerpt(input.content, 160),
      keywords: input.keywords,
      status: input.status,
      isFeatured: input.isFeatured,
      readingTime: readingTimeMinutes(input.content),
      publishedAt,
      scheduledFor,
      author: { connect: { id: authorId } },
      category: { connect: { id: input.categoryId } },
      tags: { connect: input.tagIds.map((id) => ({ id })) },
    },
    include: postInclude,
  })

  logger.info('post created', { postId: post.id, status: post.status })
  // Only a live post affects the public site.
  if (post.status === PostStatus.PUBLISHED) revalidateForPost(post)
  return post
}

export async function updatePost(id: string, input: UpdatePostInput): Promise<PostWithRelations> {
  const existing = await prisma.post.findUnique({
    where: { id },
    select: { id: true, title: true, slug: true, status: true, publishedAt: true },
  })
  if (!existing) throw new NotFoundError('Post not found')

  const data: Prisma.PostUpdateInput = {}

  if (input.title !== undefined) data.title = input.title
  if (input.content !== undefined) {
    data.content = input.content
    data.readingTime = readingTimeMinutes(input.content)
  }
  if (input.excerpt !== undefined) data.excerpt = input.excerpt
  if (input.coverImage !== undefined) data.coverImage = input.coverImage
  if (input.coverImageAlt !== undefined) data.coverImageAlt = input.coverImageAlt
  if (input.metaTitle !== undefined) data.metaTitle = input.metaTitle
  if (input.metaDescription !== undefined) data.metaDescription = input.metaDescription
  if (input.keywords !== undefined) data.keywords = input.keywords
  if (input.isFeatured !== undefined) data.isFeatured = input.isFeatured
  if (input.categoryId !== undefined) data.category = { connect: { id: input.categoryId } }
  if (input.tagIds !== undefined) data.tags = { set: input.tagIds.map((tid) => ({ id: tid })) }

  // Slug: explicit new slug wins; otherwise re-derive if the title changed.
  if (input.slug !== undefined) {
    data.slug = await uniqueSlug(input.slug, id)
  } else if (input.title !== undefined && input.title !== existing.title) {
    data.slug = await uniqueSlug(input.title, id)
  }

  // Status transition adjusts publish/schedule timestamps.
  if (input.status !== undefined) {
    data.status = input.status
    const t = timing(input.status, input.scheduledFor ?? null, existing)
    data.publishedAt = t.publishedAt
    data.scheduledFor = t.scheduledFor
  } else if (input.scheduledFor !== undefined) {
    data.scheduledFor = input.scheduledFor
  }

  const post = await prisma.post.update({ where: { id }, data, include: postInclude })
  logger.info('post updated', { postId: post.id, status: post.status })
  // Revalidate whether it's live now or was just unpublished — the public
  // pages need to reflect the change either way.
  revalidateForPost(post, existing.slug)
  return post
}

export async function deletePost(id: string): Promise<void> {
  const existing = await prisma.post.findUnique({
    where: { id },
    select: { id: true, slug: true, status: true, category: { select: { slug: true } } },
  })
  if (!existing) throw new NotFoundError('Post not found')

  await prisma.post.delete({ where: { id } })
  logger.info('post deleted', { postId: id })

  // Purge the deleted post's page + listings from the frontend cache.
  if (existing.status === PostStatus.PUBLISHED) {
    void triggerRevalidation(postPaths(existing.slug, existing.category?.slug))
  }
}

export async function publishPost(id: string): Promise<PostWithRelations> {
  const existing = await prisma.post.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new NotFoundError('Post not found')
  const post = await prisma.post.update({
    where: { id },
    data: { status: PostStatus.PUBLISHED, publishedAt: new Date(), scheduledFor: null },
    include: postInclude,
  })
  logger.info('post published', { postId: id })
  revalidateForPost(post)
  return post
}
