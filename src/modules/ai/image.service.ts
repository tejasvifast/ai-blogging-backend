import { createApi } from 'unsplash-js'
import { v2 as cloudinary } from 'cloudinary'
import { env } from '../../config/env'
import { logger } from '../../config/logger'

export interface CoverImage {
  url: string
  alt: string
  credit?: string
}

const unsplashConfigured = Boolean(env.UNSPLASH_ACCESS_KEY)
const cloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
)

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  })
}

const unsplash = unsplashConfigured
  ? createApi({ accessKey: env.UNSPLASH_ACCESS_KEY })
  : null

/**
 * Find a cover image for a set of keywords: search Unsplash, then (if
 * configured) re-host on Cloudinary so we don't hotlink. Returns null when
 * image services aren't configured or nothing is found — the pipeline treats
 * a cover image as optional.
 */
export async function findCoverImage(
  keywords: string[],
  altText: string,
): Promise<CoverImage | null> {
  if (!unsplash) {
    logger.debug('Unsplash not configured — skipping cover image')
    return null
  }

  const query = keywords.slice(0, 3).join(' ') || 'blog'

  try {
    const result = await unsplash.search.getPhotos({ query, perPage: 5, orientation: 'landscape' })
    const photo = result.response?.results?.[0]
    if (!photo) {
      logger.debug('No Unsplash results', { query })
      return null
    }

    const sourceUrl = photo.urls.regular
    const credit = photo.user?.name ? `Photo by ${photo.user.name} on Unsplash` : undefined
    const alt = photo.alt_description || altText

    // Trigger Unsplash's download endpoint per their API guidelines.
    if (photo.links?.download_location) {
      unsplash.photos.trackDownload({ downloadLocation: photo.links.download_location }).catch(() => {})
    }

    if (!cloudinaryConfigured) {
      // No Cloudinary — return the Unsplash URL directly.
      return { url: sourceUrl, alt, ...(credit ? { credit } : {}) }
    }

    const uploaded = await cloudinary.uploader.upload(sourceUrl, {
      folder: 'blog/covers',
      transformation: [{ width: 1200, height: 630, crop: 'fill', gravity: 'auto', quality: 'auto' }],
    })

    return { url: uploaded.secure_url, alt, ...(credit ? { credit } : {}) }
  } catch (err) {
    // Never fail article generation because of an image problem.
    logger.warn('Cover image lookup failed', {
      query,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
