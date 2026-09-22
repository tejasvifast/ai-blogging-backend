import { PostStatus } from '@prisma/client'
import { prisma } from '../../../config/database'
import { logger } from '../../../config/logger'

/**
 * Delete DRAFT posts that haven't been touched in `olderThanDays` days.
 * Runs daily at 3 AM. Uses updatedAt so a draft you're actively editing is safe.
 */
export async function runCleanupDrafts(olderThanDays = 30): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

  const result = await prisma.post.deleteMany({
    where: { status: PostStatus.DRAFT, updatedAt: { lt: cutoff } },
  })

  if (result.count > 0) {
    logger.info('cleaned up stale drafts', { deleted: result.count, olderThanDays })
  }
  return { deleted: result.count }
}
