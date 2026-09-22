import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { buildSitemap, buildRss, buildRobots } from './sitemap.service'

// ── Public, mounted at root ────────────────────────────────────
export const sitemapRouter = Router()

// Cache at the CDN/browser for an hour — content changes are not second-sensitive.
const CACHE = 'public, max-age=3600, s-maxage=3600'

/** @route GET /sitemap.xml */
sitemapRouter.get(
  '/sitemap.xml',
  asyncHandler(async (_req, res) => {
    const xml = await buildSitemap()
    res.set('Content-Type', 'application/xml; charset=utf-8').set('Cache-Control', CACHE).send(xml)
  }),
)

/** @route GET /rss.xml (and /feed.xml) */
const rss = asyncHandler(async (_req, res) => {
  const xml = await buildRss()
  res
    .set('Content-Type', 'application/rss+xml; charset=utf-8')
    .set('Cache-Control', CACHE)
    .send(xml)
})
sitemapRouter.get('/rss.xml', rss)
sitemapRouter.get('/feed.xml', rss)

/** @route GET /robots.txt */
sitemapRouter.get('/robots.txt', (_req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8').set('Cache-Control', CACHE).send(buildRobots())
})
