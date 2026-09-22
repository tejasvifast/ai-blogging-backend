import { PostStatus } from '@prisma/client'
import { prisma } from '../../../config/database'
import { logger } from '../../../config/logger'
import { triggerRevalidation, postPaths } from '../../revalidation/revalidation.service'

/**
 * Publish any SCHEDULED posts whose scheduledFor time has passed.
 * Runs every 5 minutes.
 */
export async function runPublishScheduled(): Promise<{ published: number }> {
  const now = new Date()
  const due = await prisma.post.findMany({
    where: { status: PostStatus.SCHEDULED, scheduledFor: { lte: now } },
    select: { id: true, slug: true, category: { select: { slug: true } } },
  })

  if (due.length === 0) return { published: 0 }

  await prisma.post.updateMany({
    where: { id: { in: due.map((p) => p.id) } },
    data: { status: PostStatus.PUBLISHED, publishedAt: now, scheduledFor: null },
  })

  // Revalidate the frontend for every newly-live post + listing pages.
  const paths = new Set<string>(['/', '/blog'])
  for (const p of due) {
    postPaths(p.slug, p.category?.slug).forEach((path) => paths.add(path))
  }
  await triggerRevalidation([...paths])

  logger.info('published scheduled posts', { count: due.length })
  return { published: due.length }
}
