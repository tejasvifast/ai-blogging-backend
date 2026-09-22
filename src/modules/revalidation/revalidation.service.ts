import { env } from '../../config/env'
import { logger } from '../../config/logger'

/**
 * Build the set of frontend paths affected by a post change.
 */
export function postPaths(slug: string, categorySlug?: string | null): string[] {
  const paths = ['/', '/blog', `/blog/${slug}`]
  if (categorySlug) paths.push(`/category/${categorySlug}`)
  return paths
}

/**
 * Tell the Next.js frontend to revalidate (ISR) the given paths. Best-effort:
 * a revalidation failure must never break the mutation that triggered it, so
 * errors are logged and swallowed.
 */
export async function triggerRevalidation(paths: string[]): Promise<void> {
  if (paths.length === 0) return

  const url = `${env.FRONTEND_URL}/api/revalidate`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-revalidate-secret': env.REVALIDATE_SECRET,
      },
      body: JSON.stringify({ paths }),
      // Don't hang the caller if the frontend is slow/unreachable.
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      logger.warn('revalidation returned non-OK', { status: res.status, paths })
      return
    }
    logger.debug('revalidation triggered', { paths })
  } catch (err) {
    logger.warn('revalidation request failed', {
      url,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
