import type { ChatMessage } from '../providers/types'

/**
 * Answer the outline's FAQ questions in the article voice. Returns a Markdown
 * "## FAQ" block with each question as an H3 and a 2-4 sentence answer.
 */
export function faqPrompt(topic: string, questions: string[]): ChatMessage[] {
  return [
    {
      role: 'user',
      content: `Topic: "${topic}"

Answer these FAQ questions, each in 2-4 sentences, in a natural conversational voice:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Return Markdown:
## Frequently Asked Questions

### <question>
<answer>

(repeat for each question, keep the order above)`,
    },
  ]
}
