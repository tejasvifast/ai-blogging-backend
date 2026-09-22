import type { ChatMessage } from '../providers/types'
import type { OutlineSection } from './outline.prompt'

/**
 * Prompt to write one H2 section (300-400 words) in the article's voice.
 * The full outline is passed as context so sections don't repeat each other.
 */
export function sectionPrompt(args: {
  topic: string
  h1: string
  section: OutlineSection
  allH2s: string[]
}): ChatMessage[] {
  const { topic, h1, section, allH2s } = args
  return [
    {
      role: 'user',
      content: `Article topic: "${topic}"
Article title: "${h1}"
Full section list (for context — do NOT rewrite the others): ${allH2s.join(' | ')}

Write the section for this heading only:
## ${section.h2}
${section.h3s.length ? `Cover these sub-points as H3 subsections:\n${section.h3s.map((h) => `### ${h}`).join('\n')}` : ''}

Rules:
- 300-400 words for this section.
- Return Markdown starting with the "## ${section.h2}" heading.
- Include the H3 subheadings above where they fit.
- Weave in a concrete example or number.
- Do not write an intro or conclusion for the whole article — just this section.`,
    },
  ]
}

/** Prompt for the article intro (hook, ~120 words, no heading). */
export function introPrompt(topic: string, h1: string): ChatMessage[] {
  return [
    {
      role: 'user',
      content: `Write an opening hook for an article titled "${h1}" about "${topic}".
- ~100-130 words, no heading.
- Open with something surprising, a question, or a short personal anecdote.
- Set up what the reader will get out of the piece without listing it mechanically.
- Return Markdown (plain paragraphs).`,
    },
  ]
}
