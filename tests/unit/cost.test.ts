import { estimateCost } from '../../src/modules/ai/cost'

describe('estimateCost', () => {
  it('prices Haiku by prefix (handles dated model ids)', () => {
    // 1M input @ $1, 1M output @ $5 → $6
    const cost = estimateCost('claude-haiku-4-5-20251001', {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
    })
    expect(cost).toBeCloseTo(6, 5)
  })

  it('prices GPT-4o-mini', () => {
    const cost = estimateCost('gpt-4o-mini', {
      promptTokens: 1_000_000,
      completionTokens: 0,
      totalTokens: 1_000_000,
    })
    expect(cost).toBeCloseTo(0.15, 5)
  })

  it('returns null for an unknown model', () => {
    expect(
      estimateCost('some-unknown-model', { promptTokens: 100, completionTokens: 100, totalTokens: 200 }),
    ).toBeNull()
  })
})
