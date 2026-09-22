import { toSlug, readingTimeMinutes, deriveExcerpt } from '../../src/utils/text'

describe('toSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(toSlug('Hello World')).toBe('hello-world')
  })
  it('strips punctuation (and maps & → "and")', () => {
    expect(toSlug('C++ & Rust: A Guide!')).toBe('c-and-rust-a-guide')
  })
})

describe('readingTimeMinutes', () => {
  it('is at least 1 minute', () => {
    expect(readingTimeMinutes('a few words')).toBe(1)
  })
  it('rounds up ~200 wpm', () => {
    const words = Array(450).fill('word').join(' ')
    expect(readingTimeMinutes(words)).toBe(3) // 450/200 = 2.25 → 3
  })
})

describe('deriveExcerpt', () => {
  it('strips html/markdown and trims to a word boundary', () => {
    const out = deriveExcerpt('<p>Hello **world**, this is a test.</p>', 12)
    expect(out).not.toContain('<p>')
    expect(out).not.toContain('**')
    expect(out.endsWith('…')).toBe(true)
  })
  it('returns short text unchanged', () => {
    expect(deriveExcerpt('short', 100)).toBe('short')
  })
})
