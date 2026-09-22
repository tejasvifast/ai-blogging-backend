import OpenAI from 'openai'
import { env } from '../../../config/env'
import { ServiceUnavailableError } from '../../../utils/errors'
import type { AIProvider, GenerateParams, GenerateResult } from './types'

/**
 * OpenAI provider — GPT-4o-mini by default (cheap fallback for when Anthropic
 * is down or rate-limited).
 */
class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const
  readonly defaultModel = 'gpt-4o-mini'

  private client: OpenAI | null = null

  isConfigured(): boolean {
    return Boolean(env.OPENAI_API_KEY)
  }

  private getClient(): OpenAI {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableError('OpenAI provider is not configured (missing OPENAI_API_KEY)')
    }
    if (!this.client) {
      this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
    }
    return this.client
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const client = this.getClient()
    const model = params.model ?? this.defaultModel

    // OpenAI takes the system prompt as the first message.
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
    if (params.system) messages.push({ role: 'system', content: params.system })
    for (const m of params.messages) messages.push({ role: m.role, content: m.content })

    const completion = await client.chat.completions.create({
      model,
      max_tokens: params.maxTokens ?? 4096,
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
      messages,
    })

    const text = completion.choices[0]?.message?.content ?? ''
    const usage = completion.usage

    return {
      text,
      provider: this.name,
      model: completion.model,
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
    }
  }
}

export const openaiProvider = new OpenAIProvider()
