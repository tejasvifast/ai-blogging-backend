import { PostStatus } from '@prisma/client'
import { prisma } from '../../config/database'
import { env } from '../../config/env'

const BASE = env.FRONTEND_URL.replace(/\/$/, '')

/** Escape the five XML special characters. */
function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** XML sitemap of static pages + published posts + categories. */
export async function buildSitemap(): Promise<string> {
  const [posts, categories] = await Promise.all([
    prisma.post.findMany({
      where: { status: PostStatus.PUBLISHED, publishedAt: { lte: new Date() } },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
    }),
    prisma.category.findMany({ select: { slug: true } }),
  ])

  const urls: string[] = [
    `<url><loc>${xml(BASE)}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${xml(BASE)}/blog</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`,
  ]

  for (const c of categories) {
    urls.push(
      `<url><loc>${xml(BASE)}/category/${xml(c.slug)}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`,
    )
  }
  for (const p of posts) {
    urls.push(
      `<url><loc>${xml(BASE)}/blog/${xml(p.slug)}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
    )
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`
}

/** RSS 2.0 feed of the latest published posts. */
export async function buildRss(limit = 20): Promise<string> {
  const posts = await prisma.post.findMany({
    where: { status: PostStatus.PUBLISHED, publishedAt: { lte: new Date() } },
    select: { slug: true, title: true, excerpt: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  })

  const items = posts
    .map((p) => {
      const link = `${BASE}/blog/${p.slug}`
      const pubDate = (p.publishedAt ?? new Date()).toUTCString()
      return `    <item>
      <title>${xml(p.title)}</title>
      <link>${xml(link)}</link>
      <guid isPermaLink="true">${xml(link)}</guid>
      <description>${xml(p.excerpt ?? '')}</description>
      <pubDate>${pubDate}</pubDate>
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xml('Blog')}</title>
    <link>${xml(BASE)}</link>
    <description>${xml('Latest articles')}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`
}

/** robots.txt pointing at the sitemap. */
export function buildRobots(): string {
  return `User-agent: *
Allow: /

Sitemap: ${env.API_URL.replace(/\/$/, '')}/sitemap.xml
`
}
