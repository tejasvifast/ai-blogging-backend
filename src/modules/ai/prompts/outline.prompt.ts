import type { ChatMessage } from '../providers/types'

export const OUTLINE_SYSTEM =
  'You are an SEO content strategist. You produce tight, logical article outlines that rank and read well. Respond with JSON only — no prose, no code fences.'

export interface OutlineSection {
  h2: string
  h3s: string[]
}

export interface ArticleOutline {
  h1: string
  sections: OutlineSection[]
  faqs: string[] // FAQ questions
}

/** Instructs the model to return an outline matching {@link ArticleOutline}. */
export function outlinePrompt(topic: string): ChatMessage[] {
  return [
    {
      role: 'user',
      content: `Create a detailed article outline for the topic: "${topic}".

Requirements:
- One compelling H1 title (question or benefit-driven, under 60 chars).
- 5 to 7 H2 sections that flow logically.
- 2 to 3 H3 subsections under each H2.
- 4 to 6 FAQ questions a real reader would ask.

Return ONLY this JSON shape:
{
  "h1": "string",
  "sections": [{ "h2": "string", "h3s": ["string", "string"] }],
  "faqs": ["string", "string"]
}`,
    },
  ]
}
