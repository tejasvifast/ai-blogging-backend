import slugifyLib from 'slugify'

/** URL-safe slug: lowercased, stripped of punctuation. */
export function toSlug(input: string): string {
  return slugifyLib(input, { lower: true, strict: true, trim: true })
}

/** ~200 wpm reading estimate in minutes, floored at 1. */
export function readingTimeMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

/**
 * Derive a plain-text excerpt from (possibly HTML/markdown) content, trimmed to
 * a word boundary near `maxLen`.
 */
export function deriveExcerpt(content: string, maxLen = 160): string {
  const plain = content
    .replace(/<[^>]+>/g, ' ') // strip HTML tags
    .replace(/[#*_`>[\]()]/g, '') // strip common markdown
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= maxLen) return plain
  const cut = plain.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLen).trim()}…`
}
