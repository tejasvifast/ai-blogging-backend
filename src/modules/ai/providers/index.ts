import { env } from '../../../config/env'
import { logger } from '../../../config/logger'
import { ServiceUnavailableError } from '../../../utils/errors'
import { anthropicProvider } from './anthropic.provider'
import { openaiProvider } from './openai.provider'
import type { AIProvider, AIProviderName, GenerateParams, GenerateResult } from './types'

const providers: Record<AIProviderName, AIProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
}

export function getProvider(name: AIProviderName): AIProvider {
  return providers[name]
}

/** The configured default provider (env DEFAULT_AI_PROVIDER). */
export function defaultProvider(): AIProvider {
  return providers[env.DEFAULT_AI_PROVIDER]
}

/** Ordered fallback chain: default first, then the other configured provider. */
function fallbackChain(preferred?: AIProviderName): AIProvider[] {
  const order: AIProviderName[] =
    preferred === 'openai'
      ? ['openai', 'anthropic']
      : preferred === 'anthropic'
        ? ['anthropic', 'openai']
        : env.DEFAULT_AI_PROVIDER === 'openai'
          ? ['openai', 'anthropic']
          : ['anthropic', 'openai']
  return order.map((n) => providers[n]).filter((p) => p.isConfigured())
}

/**
 * Run a generation, transparently falling back to the next configured provider
 * if the primary one errors. Throws only if every provider fails.
 */
export async function generate(
  params: GenerateParams & { provider?: AIProviderName | undefined },
): Promise<GenerateResult> {
  const chain = fallbackChain(params.provider)
  if (chain.length === 0) {
    throw new ServiceUnavailableError('No AI provider is configured')
  }

  // Separate the routing hint + model id from the pass-through params.
  const { provider: preferred, model, ...base } = params
  const intendedProvider = preferred ?? env.DEFAULT_AI_PROVIDER

  let lastError: unknown
  for (const provider of chain) {
    try {
      // A model id is provider-specific — only forward it to the provider it
      // was meant for; drop it (use that provider's default) when falling back.
      const genParams: GenerateParams =
        provider.name === intendedProvider && model !== undefined ? { ...base, model } : { ...base }
      return await provider.generate(genParams)
    } catch (err) {
      lastError = err
      logger.warn('AI provider failed, trying fallback', {
        provider: provider.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  throw new ServiceUnavailableError('All AI providers failed', {
    cause: lastError instanceof Error ? lastError.message : String(lastError),
  })
}

export type { AIProvider, AIProviderName, GenerateParams, GenerateResult } from './types'
