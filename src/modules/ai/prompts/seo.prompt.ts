import type { ChatMessage } from '../providers/types'

export const SEO_SYSTEM =
  'You are an SEO specialist. You write titles and meta descriptions that earn clicks and respect length limits. Respond with JSON only.'

export interface SeoMetadata {
  metaTitle: string
  metaDescription: string
  keywords: string[]
  excerpt: string
}

export function seoPrompt(topic: string, articleMarkdown: string): ChatMessage[] {
  // Cap the article we send for context — the first ~1500 chars are plenty.
  const context = articleMarkdown.slice(0, 1500)
  return [
    {
      role: 'user',
      content: `Topic: "${topic}"

Article (excerpt for context):
"""
${context}
"""

Produce SEO metadata. Return ONLY this JSON:
{
  "metaTitle": "50-60 chars, compelling, includes the primary keyword",
  "metaDescription": "150-160 chars, active voice, includes a benefit and a soft CTA",
  "keywords": ["5 to 8 relevant search keywords"],
  "excerpt": "a 1-2 sentence plain-text summary, under 200 chars"
}`,
    },
  ]
}
