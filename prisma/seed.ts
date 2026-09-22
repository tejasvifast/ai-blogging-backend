/* eslint-disable no-console */
import { PrismaClient, PostStatus, Role, Provider } from '@prisma/client'
import bcrypt from 'bcryptjs'
import slugify from 'slugify'

const prisma = new PrismaClient()

// ── Helpers ────────────────────────────────────────────────────

const slug = (s: string) => slugify(s, { lower: true, strict: true, trim: true })

/** ~200 words/min reading estimate, rounded up, floored at 1. */
const readingTime = (content: string) =>
  Math.max(1, Math.ceil(content.trim().split(/\s+/).length / 200))

// ── Seed data ──────────────────────────────────────────────────

const ADMIN_EMAIL = (process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || 'admin@example.com').toLowerCase()
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!'
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12)

const CATEGORIES = [
  {
    name: 'Technology',
    description: 'Deep dives on software, hardware, and the tools shaping how we build.',
    icon: '💻',
    color: '#3b82f6',
  },
  {
    name: 'Productivity',
    description: 'Systems, habits, and workflows for getting meaningful work done.',
    icon: '⚡',
    color: '#f59e0b',
  },
  {
    name: 'Marketing',
    description: 'Growth, SEO, and content strategy that actually moves numbers.',
    icon: '📈',
    color: '#10b981',
  },
]

const TAGS = ['nextjs', 'ai', 'seo', 'automation', 'typescript', 'career', 'startups']

type SeedPost = {
  title: string
  excerpt: string
  content: string
  category: string
  tags: string[]
  keywords: string[]
  isFeatured?: boolean
  isAIGenerated?: boolean
  aiProvider?: string
  aiModel?: string
}

const POSTS: SeedPost[] = [
  {
    title: 'How I Cut My Next.js Build Times in Half',
    excerpt:
      'Build times crept past four minutes and I finally snapped. Here is exactly what I changed.',
    content:
      "Four minutes. That's how long our Next.js build took before I got fed up. If you've ever watched a CI pipeline crawl while you sip cold coffee, you know the feeling.\n\nThe first win came from turning off source maps in production. We weren't using them anyway. Then I audited our dependencies and found three packages doing the job of one. Ripping those out shaved 40 seconds.\n\nThe big one? Incremental type checking. We moved `tsc` out of the build path and let the bundler handle transforms, running type checks in parallel instead. Suddenly the build finished before I could finish reading a Slack thread.",
    category: 'Technology',
    tags: ['nextjs', 'typescript'],
    keywords: ['nextjs build time', 'faster builds', 'ci optimization'],
    isFeatured: true,
  },
  {
    title: 'The Two-List Trick That Fixed My Scattered Workday',
    excerpt: 'One list for today, one for everything else. That is the whole system.',
    content:
      "I tried every productivity app you can name. Notion, Todoist, sticky notes stuck to my monitor like digital confetti. None of it stuck.\n\nThen a mentor told me something dead simple: keep two lists. One holds what you'll actually do today, capped at five items. The other is the dumping ground for everything else. Each morning you pull from the big list into the small one.\n\nWhy does it work? Because the five-item cap forces a decision. You can't hide behind a list of forty things when only five fit.",
    category: 'Productivity',
    tags: ['career', 'automation'],
    keywords: ['productivity system', 'todo list', 'focus'],
  },
  {
    title: 'SEO in 2026: What Actually Still Works',
    excerpt: 'Half of what you read about SEO is outdated. Here is the part that is not.',
    content:
      "Search changed. Again. But the fundamentals didn't move as much as the panic-posts want you to believe.\n\nContent that answers a real question still ranks. Fast pages still win. Links from sites people actually trust still matter. What changed is the noise floor: AI-generated filler flooded the web, so genuine expertise stands out more, not less.\n\nMy advice? Write the thing only you could write. Add the specific number, the awkward caveat, the story that didn't go to plan. Algorithms chase signals of real experience now, and you can't fake a scar.",
    category: 'Marketing',
    tags: ['seo', 'ai'],
    keywords: ['seo 2026', 'search ranking', 'content strategy'],
    isFeatured: true,
    isAIGenerated: true,
    aiProvider: 'anthropic',
    aiModel: 'claude-haiku-4-5-20251001',
  },
  {
    title: 'Automating the Boring 20% of My Job',
    excerpt: 'A weekend of scripting bought back three hours every week. Worth it.',
    content:
      "Every job has that slice of work nobody enjoys. For me it was weekly reports: copy numbers, paste into a doc, format, send. Twenty minutes that felt like two hours.\n\nSo I spent a Saturday wiring up a small script. It pulls the metrics, drops them into a template, and emails the draft to me for a quick review. I still hit send myself, because I don't fully trust a robot with my boss's inbox yet.\n\nThree hours a week, back in my pocket. The lesson isn't 'automate everything.' It's 'automate the part that makes you groan.'",
    category: 'Productivity',
    tags: ['automation', 'typescript'],
    keywords: ['work automation', 'scripting', 'save time'],
  },
  {
    title: 'Why Small Startups Should Ship Ugly First',
    excerpt: 'Polish is a tax you pay after you know people want the thing.',
    content:
      "I've watched founders spend three months perfecting a landing page for a product nobody asked for. Painful to watch, painful to live through — I've done it too.\n\nHere's the uncomfortable truth: nobody cares about your rounded corners until they care about your product. Ship the ugly version. Watch what people click. Listen to what they complain about. Then, and only then, spend the polish budget.\n\nUgly-but-useful beats beautiful-but-pointless every single time. Your future designer will thank you for waiting.",
    category: 'Marketing',
    tags: ['startups', 'career'],
    keywords: ['startup mvp', 'ship fast', 'product launch'],
  },
]

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding database...')

  // 1) Admin user
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS)
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      password: passwordHash,
      name: 'Site Admin',
      role: Role.ADMIN,
      provider: Provider.CREDENTIALS,
      emailVerified: true,
      bio: 'Runs the show around here.',
    },
  })
  console.log(`  👤 Admin user: ${admin.email}`)

  // 2) Categories
  const categoryByName = new Map<string, string>()
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { slug: slug(c.name) },
      update: { description: c.description, icon: c.icon, color: c.color },
      create: {
        name: c.name,
        slug: slug(c.name),
        description: c.description,
        icon: c.icon,
        color: c.color,
      },
    })
    categoryByName.set(c.name, cat.id)
    console.log(`  🗂  Category: ${cat.name}`)
  }

  // 3) Tags
  const tagByName = new Map<string, string>()
  for (const name of TAGS) {
    const tag = await prisma.tag.upsert({
      where: { slug: slug(name) },
      update: {},
      create: { name, slug: slug(name) },
    })
    tagByName.set(name, tag.id)
  }
  console.log(`  🏷  Tags: ${TAGS.length}`)

  // 4) Posts (published), spaced out over the past days
  let daysAgo = POSTS.length
  for (const p of POSTS) {
    const categoryId = categoryByName.get(p.category)
    if (!categoryId) throw new Error(`Unknown category in seed: ${p.category}`)

    const publishedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    daysAgo -= 1

    const postSlug = slug(p.title)
    await prisma.post.upsert({
      where: { slug: postSlug },
      update: {},
      create: {
        title: p.title,
        slug: postSlug,
        excerpt: p.excerpt,
        content: p.content,
        coverImage: `https://picsum.photos/seed/${postSlug}/1200/630`,
        coverImageAlt: p.title,
        metaTitle: p.title.slice(0, 60),
        metaDescription: p.excerpt.slice(0, 160),
        keywords: p.keywords,
        status: PostStatus.PUBLISHED,
        isFeatured: p.isFeatured ?? false,
        isAIGenerated: p.isAIGenerated ?? false,
        aiProvider: p.aiProvider ?? null,
        aiModel: p.aiModel ?? null,
        authorId: admin.id,
        categoryId,
        readingTime: readingTime(p.content),
        publishedAt,
        views: Math.floor((POSTS.length - daysAgo) * 137),
        tags: {
          connect: p.tags
            .map((t) => tagByName.get(t))
            .filter((id): id is string => Boolean(id))
            .map((id) => ({ id })),
        },
      },
    })
    console.log(`  📝 Post: ${p.title}`)
  }

  console.log('✅ Seed complete.')
  console.log(`\n   Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  console.log('   (override with SEED_ADMIN_PASSWORD env var)\n')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
