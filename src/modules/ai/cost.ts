import type { AIProviderName, TokenUsage } from './providers/types'

/**
 * Per-model pricing in USD per 1M tokens. Matched by prefix so dated model ids
 * (e.g. claude-haiku-4-5-20251001) resolve to the base entry.
 *
 * ⚠️ Keep these in sync with provider pricing pages. The build spec quoted
 * "$0.25/1M" for Haiku, but current Haiku 4.5 pricing is $1.00 in / $5.00 out.
 * These figures are used only for internal cost tracking in GenerationLog.
 */
interface Price {
  inputPer1M: number
  outputPer1M: number
}

const PRICING: Array<{ prefix: string; provider: AIProviderName; price: Price }> = [
  // Anthropic
  { prefix: 'claude-haiku-4-5', provider: 'anthropic', price: { inputPer1M: 1.0, outputPer1M: 5.0 } },
  { prefix: 'claude-sonnet-5', provider: 'anthropic', price: { inputPer1M: 3.0, outputPer1M: 15.0 } },
  { prefix: 'claude-sonnet-4-6', provider: 'anthropic', price: { inputPer1M: 3.0, outputPer1M: 15.0 } },
  { prefix: 'claude-opus-4-8', provider: 'anthropic', price: { inputPer1M: 5.0, outputPer1M: 25.0 } },
  // OpenAI
  { prefix: 'gpt-4o-mini', provider: 'openai', price: { inputPer1M: 0.15, outputPer1M: 0.6 } },
  { prefix: 'gpt-4o', provider: 'openai', price: { inputPer1M: 2.5, outputPer1M: 10.0 } },
]

/**
 * Estimate the USD cost of a generation. Returns null if the model is unknown,
 * so callers can store a null cost rather than a misleading 0.
 */
export function estimateCost(model: string, usage: TokenUsage): number | null {
  const entry = PRICING.find((p) => model.startsWith(p.prefix))
  if (!entry) return null
  const input = (usage.promptTokens / 1_000_000) * entry.price.inputPer1M
  const output = (usage.completionTokens / 1_000_000) * entry.price.outputPer1M
  // Round to 6 decimals — sub-cent precision matters at scale.
  return Math.round((input + output) * 1e6) / 1e6
}
