import { PostStatus, type Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { logger } from '../../config/logger'
import { NotFoundError, ServiceUnavailableError } from '../../utils/errors'
import { extractJson } from '../../utils/json'
import { sanitizeHtml } from '../../utils/sanitize'
import { toSlug, readingTimeMinutes, deriveExcerpt } from '../../utils/text'
import { generate } from './providers'
import type { AIProviderName, GenerateResult } from './providers/types'
import { estimateCost } from './cost'
import { buildSystemPrompt } from './prompts/system'
import { OUTLINE_SYSTEM, outlinePrompt, type ArticleOutline } from './prompts/outline.prompt'
import { sectionPrompt, introPrompt } from './prompts/article.prompt'
import { SEO_SYSTEM, seoPrompt, type SeoMetadata } from './prompts/seo.prompt'
import { faqPrompt } from './prompts/faq.prompt'
import { findCoverImage } from './image.service'
import { triggerRevalidation, postPaths } from '../revalidation/revalidation.service'

export interface GenerateArticleInput {
  topic: string
  categoryId: string
  authorId: string
  tagIds?: string[]
  /** Provider for this run (defaults to env DEFAULT_AI_PROVIDER). */
  provider?: AIProviderName
  /** Higher-quality model for section content (defaults to the provider default). */
  contentModel?: string
  /** Publish immediately vs save as draft. */
  autoPublish?: boolean
  /** When triggered by a cron job, links the GenerationLog back to it. */
  cronJobId?: string
}

/** Accumulates token usage + cost across every call in the pipeline. */
class UsageTracker {
  promptTokens = 0
  completionTokens = 0
  cost = 0
  readonly models = new Set<string>()

  record(result: GenerateResult): GenerateResult {
    this.promptTokens += result.usage.promptTokens
    this.completionTokens += result.usage.completionTokens
    this.models.add(result.model)
    const c = estimateCost(result.model, result.usage)
    if (c !== null) this.cost += c
    return result
  }

  get totalTokens(): number {
    return this.promptTokens + this.completionTokens
  }
}

async function uniqueSlug(base: string): Promise<string> {
  const root = toSlug(base) || 'article'
  let candidate = root
  let n = 1
  while (n < 1000) {
    const clash = await prisma.post.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!clash) return candidate
    n += 1
    candidate = `${root}-${n}`
  }
  return `${root}-${Date.now()}`
}

/**
 * Full generation pipeline:
 *   outline → intro + sections (parallel) → FAQ → SEO → cover image → assemble → save
 * Every step's token usage and cost is logged to GenerationLog.
 */
export async function generateArticle(input: GenerateArticleInput): Promise<{
  postId: string
  slug: string
  status: PostStatus
}> {
  const startedAt = Date.now()
  const usage = new UsageTracker()
  const system = buildSystemPrompt()
  const contentModel = input.contentModel // undefined → provider default

  // Validate the category up front so we fail before spending tokens.
  const category = await prisma.category.findUnique({
    where: { id: input.categoryId },
    select: { id: true },
  })
  if (!category) throw new NotFoundError('Category not found')

  try {
    // ── Step 1: Outline (cheap model) ────────────────────────
    const outlineRes = usage.record(
      await generate({
        provider: input.provider,
        system: OUTLINE_SYSTEM,
        messages: outlinePrompt(input.topic),
        maxTokens: 1500,
      }),
    )
    const outline = extractJson<ArticleOutline>(outlineRes.text)
    if (!outline.h1 || !Array.isArray(outline.sections) || outline.sections.length === 0) {
      throw new ServiceUnavailableError('AI returned an unusable outline')
    }
    const allH2s = outline.sections.map((s) => s.h2)

    // ── Step 2: Intro + sections (parallel) ──────────────────
    const [introRes, ...sectionResults] = await Promise.all([
      generate({
        provider: input.provider,
        model: contentModel,
        system,
        messages: introPrompt(input.topic, outline.h1),
        maxTokens: 400,
        temperature: 0.9,
      }),
      ...outline.sections.map((section) =>
        generate({
          provider: input.provider,
          model: contentModel,
          system,
          messages: sectionPrompt({ topic: input.topic, h1: outline.h1, section, allH2s }),
          maxTokens: 900,
          temperature: 0.85,
        }),
      ),
    ])
    usage.record(introRes)
    sectionResults.forEach((r) => usage.record(r))

    // ── Step 3: FAQ ──────────────────────────────────────────
    let faqMarkdown = ''
    if (outline.faqs?.length) {
      const faqRes = usage.record(
        await generate({
          provider: input.provider,
          model: contentModel,
          system,
          messages: faqPrompt(input.topic, outline.faqs),
          maxTokens: 900,
          temperature: 0.8,
        }),
      )
      faqMarkdown = faqRes.text.trim()
    }

    // ── Assemble body ────────────────────────────────────────
    const body = [
      introRes.text.trim(),
      ...sectionResults.map((r) => r.text.trim()),
      faqMarkdown,
    ]
      .filter(Boolean)
      .join('\n\n')

    // Sanitize in case the model emitted inline HTML.
    const content = sanitizeHtml(body)

    // ── Step 4: SEO metadata ─────────────────────────────────
    const seoRes = usage.record(
      await generate({
        provider: input.provider,
        system: SEO_SYSTEM,
        messages: seoPrompt(input.topic, content),
        maxTokens: 500,
      }),
    )
    let seo: SeoMetadata
    try {
      seo = extractJson<SeoMetadata>(seoRes.text)
    } catch {
      // SEO is non-critical — fall back to derived values.
      seo = {
        metaTitle: outline.h1.slice(0, 60),
        metaDescription: deriveExcerpt(content, 160),
        keywords: [],
        excerpt: deriveExcerpt(content, 180),
      }
    }

    // ── Step 5: Cover image (optional) ───────────────────────
    const cover = await findCoverImage(seo.keywords ?? [], outline.h1)

    // ── Step 6: Persist ──────────────────────────────────────
    const slug = await uniqueSlug(outline.h1)
    const publish = input.autoPublish === true
    const primaryModel = contentModel ?? outlineRes.model
    const provider = input.provider ?? outlineRes.provider

    const post = await prisma.post.create({
      data: {
        title: outline.h1,
        slug,
        content,
        excerpt: (seo.excerpt || deriveExcerpt(content)).slice(0, 300),
        metaTitle: (seo.metaTitle || outline.h1).slice(0, 70),
        metaDescription: (seo.metaDescription || deriveExcerpt(content, 160)).slice(0, 200),
        keywords: (seo.keywords ?? []).slice(0, 12),
        coverImage: cover?.url ?? null,
        coverImageAlt: cover?.alt ?? null,
        status: publish ? PostStatus.PUBLISHED : PostStatus.DRAFT,
        isAIGenerated: true,
        aiProvider: provider,
        aiModel: primaryModel,
        readingTime: readingTimeMinutes(content),
        publishedAt: publish ? new Date() : null,
        author: { connect: { id: input.authorId } },
        category: { connect: { id: input.categoryId } },
        ...(input.tagIds?.length
          ? { tags: { connect: input.tagIds.map((id) => ({ id })) } }
          : {}),
      },
      select: { id: true, slug: true, status: true },
    })

    const durationMs = Date.now() - startedAt
    await prisma.generationLog.create({
      data: {
        postId: post.id,
        cronJobId: input.cronJobId ?? null,
        status: 'SUCCESS',
        provider,
        model: primaryModel,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        cost: usage.cost,
        durationMs,
        metadata: {
          topic: input.topic,
          modelsUsed: Array.from(usage.models),
          sections: outline.sections.length,
          hadCoverImage: Boolean(cover),
        } satisfies Prisma.InputJsonValue,
      },
    })

    logger.info('article generated', {
      postId: post.id,
      durationMs,
      totalTokens: usage.totalTokens,
      cost: usage.cost,
    })

    // A freshly auto-published AI post should appear on the site immediately.
    if (publish) void triggerRevalidation(postPaths(post.slug))
    return { postId: post.id, slug: post.slug, status: post.status }
  } catch (err) {
    // Log the failure with whatever usage we accumulated before it broke.
    await prisma.generationLog
      .create({
        data: {
          cronJobId: input.cronJobId ?? null,
          status: 'FAILED',
          provider: input.provider ?? 'anthropic',
          model: input.contentModel ?? 'unknown',
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          cost: usage.cost,
          durationMs: Date.now() - startedAt,
          error: err instanceof Error ? err.message : String(err),
          metadata: { topic: input.topic } satisfies Prisma.InputJsonValue,
        },
      })
      .catch((e) => logger.error('failed to write GenerationLog', { error: String(e) }))

    throw err
  }
}
