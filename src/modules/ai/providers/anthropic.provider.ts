import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../../config/env'
import { ServiceUnavailableError } from '../../../utils/errors'
import type { AIProvider, GenerateParams, GenerateResult } from './types'

/**
 * Anthropic Claude provider. Default model is Claude Haiku (cheap/fast), set via
 * DEFAULT_AI_MODEL. Callers pass a bigger model (e.g. claude-sonnet-5) per-call
 * for higher-quality main content.
 */
class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic' as const
  readonly defaultModel = env.DEFAULT_AI_MODEL

  private client: Anthropic | null = null

  isConfigured(): boolean {
    return Boolean(env.ANTHROPIC_API_KEY)
  }

  private getClient(): Anthropic {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableError('Anthropic provider is not configured (missing ANTHROPIC_API_KEY)')
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    }
    return this.client
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const client = this.getClient()
    const model = params.model ?? this.defaultModel
    const maxTokens = params.maxTokens ?? 4096

    const message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(params.system ? { system: params.system } : {}),
      // temperature is accepted on Haiku 4.5; harmless to omit when undefined.
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    })

    // content is a discriminated union — collect only text blocks.
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    return {
      text,
      provider: this.name,
      model: message.model,
      usage: {
        promptTokens: message.usage.input_tokens,
        completionTokens: message.usage.output_tokens,
        totalTokens: message.usage.input_tokens + message.usage.output_tokens,
      },
    }
  }
}

export const anthropicProvider = new AnthropicProvider()
